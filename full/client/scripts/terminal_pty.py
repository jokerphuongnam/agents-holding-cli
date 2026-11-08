#!/usr/bin/env python3
import argparse, hashlib, json, os, pty, select, secrets, socket, sys, time, re
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True); ap.add_argument('--company', default='')
    ap.add_argument('--state', required=True); ap.add_argument('--allow', action='append', default=[])
    a = ap.parse_args()
    repo = os.path.realpath(a.repo); state = Path(a.state); state.parent.mkdir(parents=True, exist_ok=True)
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
        shell = os.environ.get('SHELL', '/bin/sh'); os.execvp(shell, [shell, '-i'])
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); srv.bind(str(sock)); os.chmod(sock, 0o600); srv.listen(8); srv.setblocking(False)
    clients = []; jobs = {}; active_job = None
    try:
        print(json.dumps({'session_id': sid, 'status': 'connected', 'repo': repo, 'socket': str(sock),
                          'message': 'PTY registered; this terminal remains attached. Run terminal dispatch from another shell.'}), flush=True)
        while True:
            ready, _, _ = select.select([master, srv, sys.stdin], [], [], 1)
            if master in ready:
                try: data = os.read(master, 65536)
                except OSError: data = b''
                if not data: break
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
                    if active_job: os.write(master, b'\x03')
                    c.sendall((json.dumps({'ok': True, 'job_id': active_job, 'status': 'cancel_requested'}) + '\n').encode()); c.close()
                elif op == 'dispatch':
                    command = req.get('command', '')
                    if active_job:
                        active = jobs.get(active_job, {})
                        error = 'terminal already running this command' if active.get('command') == command else 'terminal is busy'
                        c.sendall((json.dumps({'ok': False, 'error': error, 'active_job': active_job,
                                               'active_command': active.get('command'),
                                               'active_started_at': active.get('started_at')}) + '\n').encode()); c.close(); continue
                    if meta['allowlist'] and not any(command.strip().startswith(x) for x in meta['allowlist']):
                        c.sendall(b'{"ok":false,"error":"command is not on terminal allowlist"}\n'); c.close(); continue
                    job_id = 'job-' + secrets.token_hex(10); marker = '__AH_DONE_' + secrets.token_hex(8) + '__'
                    jobs[job_id] = {'marker': marker.encode(), 'client': c, 'command': command, 'started_at': time.time(), 'buf': b''}
                    active_job = job_id; meta['active_job'] = {'job_id': job_id, 'command': command, 'started_at': jobs[job_id]['started_at']}; state.write_text(json.dumps(meta)); c.setblocking(False)
                    os.write(master, (command + f"\nprintf '{marker}:%s\\n' $?\n" ).encode())
                else: c.close()
            if active_job and active_job in jobs and re.search(re.escape(jobs[active_job]['marker'].decode()) + r':-?\d+', jobs[active_job]['buf'].decode(errors='replace')):
                job = jobs[active_job]; text = job['buf'].decode(errors='replace')
                match = re.search(re.escape(job['marker'].decode()) + r':(-?\d+)', text); exit_code = int(match.group(1)) if match else 1
                transcript = job['buf'].decode(errors='replace')
                event = {'event': 'completion', 'session_id': sid, 'job_id': active_job, 'status': 'completed',
                         'command': job['command'], 'cwd': repo, 'repo': repo, 'exit_code': exit_code,
                         'transcript_sha256': hashlib.sha256(transcript.encode()).hexdigest(),
                         'started_at': job['started_at'], 'completed_at': time.time()}
                try: job['client'].sendall((json.dumps(event) + '\n').encode())
                except OSError: pass
                elapsed = max(0, time.time() - job['started_at'])
                print(f"[terminal] completed command={job['command']} exit_code={exit_code} elapsed_sec={elapsed:.1f} output_bytes={len(transcript.encode())}", flush=True)
                job['client'].close(); del jobs[active_job]; active_job = None
                meta['active_job'] = None; meta['heartbeat_at'] = time.time(); state.write_text(json.dumps(meta))
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
