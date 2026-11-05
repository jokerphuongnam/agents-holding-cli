#!/usr/bin/env python3
"""Ctrl-C test wrapper (run inside pty_drive.py): run argv as the foreground child, ignore SIGINT here, then report the child's
exit code and whether echo/icanon/isig are back on the terminal."""
import os, signal, subprocess, sys, termios
signal.signal(signal.SIGINT, signal.SIG_IGN)
p = subprocess.run(sys.argv[1:], preexec_fn=lambda: signal.signal(signal.SIGINT, signal.SIG_DFL))
rc = p.returncode if p.returncode >= 0 else 128 - p.returncode
l = termios.tcgetattr(0)[3]
print("rc=%d" % rc)
if l & termios.ECHO and l & termios.ICANON and l & termios.ISIG: print("STTY_RESTORED")
