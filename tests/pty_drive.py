#!/usr/bin/env python3
"""Run a command in a pseudo-terminal, feed keystrokes, print output + exit code.
usage: pty_drive.py '<keys with python escapes>' cmd args...   Keys are sent one chunk per 0.15s; '|' separates chunks."""
import os, pty, sys, time, select, codecs
keys = codecs.decode(sys.argv[1], "unicode_escape").split("|") if sys.argv[1] else []
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[2], sys.argv[2:])
out = b""
def pump(t):
    global out
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: d = os.read(fd, 4096)
            except OSError: return False
            if not d: return False
            out += d
    return True
pump(0.6)
for k in keys:
    try: os.write(fd, k.encode())
    except OSError: break  # child already exited
    pump(0.2)
end = time.time() + float(os.environ.get("PTY_WAIT", "10"))
while time.time() < end and pump(0.1): pass
w, st = os.waitpid(pid, os.WNOHANG)
if w == 0:  # still running after the deadline: a hang, fail loudly
    os.kill(pid, 9); out += b"\n[HUNG: killed]"; _, st = os.waitpid(pid, 0)
sys.stdout.write(out.decode("utf-8", "replace"))
print("\n[exit %d]" % (os.waitstatus_to_exitcode(st)))
