#!/usr/bin/env python3
import argparse, hashlib, json, os, pty, select, secrets, shlex, socket, sys, time, re
from pathlib import Path

ANSI_RE = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')

class CompactTestOutput:
    """Show concise live test progress while the job buffer keeps raw output."""
    def __init__(self):
        self.pending = ''
        self.progress_open = False

    def _write(self, value):
        os.write(sys.stdout.fileno(), value.encode(errors='replace'))
        sys.stdout.flush()

    def _line(self, raw):
        line = ANSI_RE.sub('', raw)
        line = ''.join(ch for ch in line if ch == '\t' or ord(ch) >= 32).strip()
        if not line:
            return

        unit_test = re.match(r'^\[UnitTest\] BEGIN (.+)$', line)
        if unit_test:
            self._progress('[UnitTest] ' + unit_test.group(1))
            return
        if re.match(r'^\[UnitTest\] PASS\b', line):
            return
        if line.startswith('> Task '):
            self._progress('[Gradle] ' + line[7:])
            return
        if line.startswith('[mpm gradle]'):
            self._report(line)
            return
        if line.startswith('[mpm test]') or line.startswith('[mpm project] generated'):
            self._report(line)
            return
        if line.startswith('[UnitTest] SUMMARY') or line.startswith('[UnitTest] FAIL'):
            self._report(line)
            return
        if (line.startswith('FAILURE:') or line.startswith('BUILD FAILED') or
                line.startswith('BUILD SUCCESSFUL') or line.startswith('xcodebuild: error:') or
                line.startswith('ERROR:') or 'CoreSimulator is out of date' in line or
                'defined multiple times:' in line or '[mpm test] Xcode' in line or
                '[mpm test] Gradle' in line or '[mpm test] Marlin:' in line or
                'assertionFailures=' in line or line.startswith('Lane summary:') or
                line.startswith('PASS ./run_tests') or line.startswith('FAIL ./run_tests')):
            self._report(line)
            return
        if line.startswith('MPM:') or line.startswith('══') or line.startswith('==='):
            self._progress(line)

    def _clear_progress(self):
        if self.progress_open:
            self._write('\r\x1b[2K')
            self.progress_open = False

    def _progress(self, line):
        self._clear_progress()
        self._write(line[:360])
        self.progress_open = True

    def _report(self, line):
        self._clear_progress()
        self._write(line[:600] + '\n')

    def feed(self, data):
        self.pending += data.decode(errors='replace')
        while True:
            match = re.search(r'[\r\n]', self.pending)
            if not match:
                break
            line = self.pending[:match.start()]
            end = match.end()
            if self.pending[match.start():end] == '\r' and end < len(self.pending) and self.pending[end] == '\n':
                end += 1
            self.pending = self.pending[end:]
            self._line(line)

    def finish(self):
        if self.pending:
            self._line(self.pending)
            self.pending = ''
        self._clear_progress()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True); ap.add_argument('--company', default='')
    ap.add_argument('--state', required=True); ap.add_argument('--allow', action='append', default=[])
    a = ap.parse_args()
    repo = os.path.realpath(a.repo); state = Path(a.state); state.parent.mkdir(parents=True, exist_ok=True)
    logs_dir = state.parent / 'logs'; logs_dir.mkdir(parents=True, exist_ok=True, mode=0o700); os.chmod(logs_dir, 0o700)
    # macOS AF_UNIX paths are short; keep the authenticated socket in /tmp and
    # retain its exact path in the 0600 state record.
    sid = 'term-' + secrets.token_hex(12); sock = Path('/tmp') / ('ah-pty-' + secrets.token_hex(10) + '.sock')
    try: sock.unlink()
    except FileNotFoundError: pass
    token = secrets.token_urlsafe(32)
    meta = {'session_id': sid, 'token': token, 'status': 'connected', 'transport': 'pty',
            'company': a.company or None, 'repo': repo, 'cwd': repo,
            'user_id': os.getenv('USER', 'unknown'), 'device_id': os.getenv('AGENTS_HOLDING_DEVICE', 'local-device'),
            'pid': os.getpid(), 'socket': str(sock), 'allowlist': a.allow,
            'active_job': None,
            'started_at': time.time(), 'heartbeat_at': time.time()}
    state.write_text(json.dumps(meta)); os.chmod(state, 0o600)
    pid, master = pty.fork()
    if pid == 0:
        os.chdir(repo); os.environ['PS1'] = ''
        # The terminal's registered company is the shell's default company
        # context too. Commands such as `holding staff list` and nested
        # `holding staff run` must not fall back to another local company.
        if a.company: os.environ['AH_COMPANY'] = a.company
        os.environ['AH_TERMINAL_SESSION_ID'] = sid
        shell = os.environ.get('SHELL', '/bin/sh'); os.execvp(shell, [shell, '-i'])
    def open_server():
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(str(sock)); os.chmod(sock, 0o600); s.listen(8); s.setblocking(False)
        meta['socket'] = str(sock); meta['status'] = 'connected'; meta['heartbeat_at'] = time.time()
        state.write_text(json.dumps(meta)); os.chmod(state, 0o600)
        return s
    srv = open_server()
    clients = []; jobs = {}; active_job = None
    last_heartbeat = time.monotonic()

    def finish_job(job_id, exit_code, status='completed'):
        nonlocal active_job
        job = jobs.get(job_id)
        if not job: return
        completed_at = time.time(); elapsed = max(0, completed_at - job['started_at'])
        completed_iso = time.strftime('%Y-%m-%dT%H:%M:%S%z', time.localtime(completed_at))
        transcript = job['buf'].decode(errors='replace')
        log_path = logs_dir / f'{sid}-{job_id}.log'
        log_path.write_bytes(transcript.encode())
        os.chmod(log_path, 0o600)
        if job.get('compact_output'):
            job['renderer'].finish()
        event = {'event': 'completion', 'session_id': sid, 'job_id': job_id, 'status': status,
                 'command': job['command'], 'cwd': repo, 'repo': repo, 'exit_code': exit_code,
                 'transcript_path': str(log_path),
                 'transcript_sha256': hashlib.sha256(transcript.encode()).hexdigest(),
                 'started_at': job['started_at'], 'completed_at': completed_at}
        try: job['client'].sendall((json.dumps(event) + '\n').encode())
        except OSError: pass
        print(f"[terminal] completed_at={completed_iso} command={job['command']} exit_code={exit_code} elapsed_sec={elapsed:.1f} output_bytes={len(transcript.encode())} status={status}", flush=True)
        if job.get('compact_output'):
            print(f"[terminal] full log: {log_path}", flush=True)
        try: job['client'].close()
        except OSError: pass
        wrapper = job.get('wrapper_path')
        if wrapper:
            try: Path(wrapper).unlink()
            except FileNotFoundError: pass
        del jobs[job_id]; active_job = None
        meta['active_job'] = None; meta['heartbeat_at'] = time.time(); state.write_text(json.dumps(meta))
    try:
        print(json.dumps({'session_id': sid, 'status': 'connected', 'repo': repo, 'socket': str(sock),
                          'message': 'PTY registered; this terminal remains attached. Run terminal dispatch from another shell.'}), flush=True)
        while True:
            if time.monotonic() - last_heartbeat >= 20:
                meta['heartbeat_at'] = time.time(); state.write_text(json.dumps(meta)); last_heartbeat = time.monotonic()
            # The PTY process can outlive an interrupted shell/UI. Recreate the
            # endpoint so Holding can reconnect without asking the developer to
            # register the terminal again.
            if not sock.exists():
                try: srv.close()
                except OSError: pass
                try: srv = open_server(); print(json.dumps({'event': 'socket_reconnected', 'socket': str(sock)}), flush=True)
                except OSError: time.sleep(1); continue
            ready, _, _ = select.select([master, srv, sys.stdin], [], [], 1)
            if master in ready:
                try: data = os.read(master, 65536)
                except OSError: data = b''
                if not data: break
                if active_job and jobs.get(active_job, {}).get('compact_output'):
                    jobs[active_job]['renderer'].feed(data)
                else:
                    os.write(sys.stdout.fileno(), data); sys.stdout.flush()
                for c in clients[:]:
                    try: c.sendall(data)
                    except OSError: clients.remove(c); c.close()
                if active_job:
                    jobs[active_job]['buf'] += data
                    try: jobs[active_job]['client'].sendall(data)
                    except OSError: pass
            if sys.stdin in ready:
                data = os.read(sys.stdin.fileno(), 4096)
                if not data: break
                os.write(master, data)
            if srv in ready:
                c, _ = srv.accept(); c.settimeout(5)
                try: req = json.loads(c.recv(4096).decode())
                except Exception: c.close(); continue
                if req.get('token') != token:
                    c.sendall(b'{"ok":false,"error":"unauthorized"}\n'); c.close(); continue
                op = req.get('op')
                if op == 'status':
                    meta['heartbeat_at'] = time.time(); c.sendall((json.dumps(meta) + '\n').encode()); c.close()
                elif op == 'heartbeat':
                    meta['heartbeat_at'] = time.time(); state.write_text(json.dumps(meta)); c.sendall(b'{"ok":true,"status":"connected"}\n'); c.close()
                elif op == 'unregister':
                    c.sendall(b'{"ok":true,"status":"unregistered"}\n'); c.close(); break
                elif op == 'cancel':
                    if active_job:
                        jobs[active_job]['cancel_requested_at'] = time.monotonic()
                        os.write(master, b'\x03')
                    c.sendall((json.dumps({'ok': True, 'job_id': active_job, 'status': 'cancel_requested' if active_job else 'idle'}) + '\n').encode()); c.close()
                elif op == 'dispatch':
                    command = req.get('command', '')
                    if active_job:
                        active = jobs.get(active_job, {})
                        error = 'terminal already running this command' if active.get('command') == command else 'terminal is busy'
                        print(f"[terminal] rejected command={command!r} reason={error} active_command={active.get('command')!r}", flush=True)
                        c.sendall((json.dumps({'ok': False, 'error': error, 'active_job': active_job,
                                               'active_command': active.get('command'),
                                               'active_started_at': active.get('started_at')}) + '\n').encode()); c.close(); continue
                    if meta['allowlist'] and not any(command.strip().startswith(x) for x in meta['allowlist']):
                        c.sendall(b'{"ok":false,"error":"command is not on terminal allowlist"}\n'); c.close(); continue
                    job_id = 'job-' + secrets.token_hex(10); marker = '__AH_DONE_' + secrets.token_hex(8) + '__'
                    compact_output = bool(re.search(r'(?:\bmpm\s+test\b|\brun_tests?\.sh\b|\bxcodebuild\b.*\btest\b|(?:^|\s)(?:gradle|gradlew)\b.*\btest\b)', command))
                    jobs[job_id] = {'marker': marker.encode(), 'client': c, 'command': command, 'started_at': time.time(), 'buf': b'',
                                    'compact_output': compact_output, 'renderer': CompactTestOutput() if compact_output else None}
                    active_job = job_id; meta['active_job'] = {'job_id': job_id, 'command': command, 'started_at': jobs[job_id]['started_at']}; state.write_text(json.dumps(meta)); c.setblocking(False)
                    started_iso = time.strftime('%Y-%m-%dT%H:%M:%S%z', time.localtime(jobs[job_id]['started_at']))
                    jobs[job_id]['started_at_iso'] = started_iso
                    print(f"[terminal] started_at={started_iso} job_id={job_id} command={command!r} cwd={repo}", flush=True)
                    # Put the completion trap in a private file, then source it
                    # with a harmless leading command. This avoids injecting a
                    # long command plus marker into interactive-shell input,
                    # where prompt hooks can consume/truncate bytes. The file
                    # is sourced in the registered shell so it inherits its
                    # cwd/environment; the requested command itself runs in a
                    # subshell so it cannot leave that shell in another cwd.
                    wrapper_path = logs_dir / f'{sid}-{job_id}.sh'
                    company_scope = ""
                    if meta.get('company'):
                        company_scope = f"export AH_COMPANY={shlex.quote(meta['company'])}; export AH_TERMINAL_SESSION_ID={shlex.quote(sid)}; "
                    wrapper_body = f"{company_scope}( eval {shlex.quote(command)} ); __ah_exit=$?; printf '%s:%s\\n' {shlex.quote(marker)} \"$__ah_exit\"\n"
                    wrapper_path.write_text(wrapper_body)
                    os.chmod(wrapper_path, 0o600)
                    jobs[job_id]['wrapper_path'] = str(wrapper_path)
                    # A previous completion event can precede the prompt;
                    # let prompt hooks settle before sourcing the wrapper.
                    time.sleep(1.0)
                    wrapped = f"true; . {shlex.quote(str(wrapper_path))}\n"
                    os.write(master, wrapped.encode())
                else: c.close()
            if active_job and active_job in jobs and re.search(re.escape(jobs[active_job]['marker'].decode()) + r':-?\d+', jobs[active_job]['buf'].decode(errors='replace')):
                job = jobs[active_job]; text = job['buf'].decode(errors='replace')
                match = re.search(re.escape(job['marker'].decode()) + r':(-?\d+)', text); exit_code = int(match.group(1)) if match else 1
                finish_job(active_job, exit_code)
            elif active_job and active_job in jobs and jobs[active_job].get('cancel_requested_at'):
                try: shell_foreground = os.tcgetpgrp(master) == os.getpgid(pid)
                except OSError: shell_foreground = False
                if shell_foreground and time.monotonic() - jobs[active_job]['cancel_requested_at'] >= 0.5:
                    finish_job(active_job, 130, 'cancelled')
    finally:
        try: os.kill(pid, 15)
        except OSError: pass
        for c in clients: c.close()
        for job in jobs.values(): job['client'].close()
        srv.close()
        try: sock.unlink()
        except FileNotFoundError: pass
        meta['status'] = 'disconnected'; state.write_text(json.dumps(meta))

if __name__ == '__main__': main()
