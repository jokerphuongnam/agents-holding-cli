#!/usr/bin/env python3
import json, os, pty, select, shutil, subprocess, tempfile, threading, time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
    home = Path(td) / 'home'; repo = Path(td) / 'repo'; home.mkdir(); repo.mkdir()
    env = os.environ.copy(); env.update(HOME=str(home), AGENTS_HOLDING_DEVICE='integration-mac', AH_COMPANY='acme')
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(repo); node = shutil.which('node'); os.execve(node, [node, str(root / 'full/client/scripts/terminal.mjs'), 'register', '--repo', str(repo), '--company', 'acme'], env)
    data = b''; deadline = time.time() + 8
    while time.time() < deadline and b'PTY registered' not in data:
        r, _, _ = select.select([fd], [], [], .1)
        if r:
            try: data += os.read(fd, 8192)
            except OSError: break
    line = next((x for x in data.decode(errors='replace').splitlines() if x.startswith('{"session_id"')), None)
    assert line, data.decode(errors='replace')
    session = json.loads(line)['session_id']
    print('registered', session, flush=True)
    def drain_terminal():
        while True:
            r, _, _ = select.select([fd], [], [], .1)
            if not r:
                continue
            try:
                if not os.read(fd, 65536):
                    return
            except OSError:
                return
    threading.Thread(target=drain_terminal, daemon=True).start()
    time.sleep(.5)
    dispatch = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'printf PTY_INTEGRATION_OK; pwd'], env=env, text=True, capture_output=True, timeout=10)
    assert dispatch.returncode == 0, dispatch.stdout + dispatch.stderr
    assert 'PTY_INTEGRATION_OK' in dispatch.stdout and repo.name in dispatch.stdout
    assert '"event": "completion"' in dispatch.stdout and '"exit_code": 0' in dispatch.stdout
    print('dispatch1', flush=True)
    scoped = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'printf "PTY_COMPANY=%s\\n" "$AH_COMPANY"'], env=env, text=True, capture_output=True, timeout=10)
    assert scoped.returncode == 0 and 'PTY_COMPANY=acme' in scoped.stdout, scoped.stdout + scoped.stderr
    print('registered company context', flush=True)
    try:
        wrong = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'printf PTY_WRONG'], env=env, text=True, capture_output=True, timeout=10)
    except subprocess.TimeoutExpired as error:
        pty_states = list((home / '.config/agents-holding/terminal-sessions').glob('pty-*.json'))
        state = json.loads(pty_states[0].read_text()) if pty_states else {}
        logs = list((home / '.config/agents-holding/terminal-sessions/logs').glob('*.log'))
        tail = logs[-1].read_text(errors='replace')[-2000:] if logs else ''
        state_summary = {'status': state.get('status'), 'active_job': state.get('active_job')}
        raise AssertionError(f"second dispatch timed out; stdout={error.stdout!r} stderr={error.stderr!r}; state={state_summary!r}; transcript_tail={tail!r}") from error
    assert wrong.returncode == 0 and 'PTY_WRONG' in wrong.stdout
    print('dispatch2', flush=True)
    failed = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'false'], env=env, text=True, capture_output=True, timeout=10)
    assert failed.returncode == 1 and '"event": "completion"' in failed.stdout and '"exit_code": 1' in failed.stdout, failed.stdout + failed.stderr
    print('nonzero completion marker', flush=True)
    for _ in range(5):
        fast = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'true'], env=env, text=True, capture_output=True, timeout=5)
        assert fast.returncode == 0, fast.stdout + fast.stderr
        assert '"event": "completion"' in fast.stdout and '"exit_code": 0' in fast.stdout, fast.stdout + fast.stderr
    print('fast completion markers', flush=True)
    unreg = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'unregister', session], env=env, text=True, capture_output=True, timeout=5)
    assert unreg.returncode == 0, unreg.stdout + unreg.stderr
    print('unregister', flush=True)
    try: os.waitpid(pid, os.WNOHANG)
    except ChildProcessError: pass
    print('terminal PTY integration: visible register, dispatch, completion evidence, scope repo, unregister PASS')
