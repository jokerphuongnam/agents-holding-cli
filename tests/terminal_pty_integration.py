#!/usr/bin/env python3
import json, os, pty, select, shutil, subprocess, tempfile, time
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
    time.sleep(.5)
    dispatch = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'printf PTY_INTEGRATION_OK; pwd'], env=env, text=True, capture_output=True, timeout=10)
    assert dispatch.returncode == 0, dispatch.stdout + dispatch.stderr
    assert 'PTY_INTEGRATION_OK' in dispatch.stdout and repo.name in dispatch.stdout
    assert '"event": "completion"' in dispatch.stdout and '"exit_code": 0' in dispatch.stdout
    print('dispatch1', flush=True)
    wrong = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'dispatch', session, 'printf PTY_WRONG'], env=env, text=True, capture_output=True, timeout=5)
    assert wrong.returncode == 0 and 'PTY_WRONG' in wrong.stdout
    print('dispatch2', flush=True)
    unreg = subprocess.run(['node', str(root / 'full/client/scripts/terminal.mjs'), 'unregister', session], env=env, text=True, capture_output=True, timeout=5)
    assert unreg.returncode == 0, unreg.stdout + unreg.stderr
    print('unregister', flush=True)
    try: os.waitpid(pid, os.WNOHANG)
    except ChildProcessError: pass
    print('terminal PTY integration: visible register, dispatch, completion evidence, scope repo, unregister PASS')
