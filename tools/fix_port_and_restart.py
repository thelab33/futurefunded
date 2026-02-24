#!/usr/bin/env python3
"""
tools/fix_port_and_restart.py

Usage examples:
  # dry-run: list who uses port 5000
  python tools/fix_port_and_restart.py

  # inspect a different port:
  python tools/fix_port_and_restart.py --port 8000

  # actually kill processes using the port (be careful!)
  sudo python tools/fix_port_and_restart.py --auto-kill

  # kill + restart service (named 'futurefunded')
  sudo python tools/fix_port_and_restart.py --auto-kill --service futurefunded

What it does:
 - lists processes listening on host:port
 - (optionally) gracefully kills them, then force-kills if they do not exit
 - stops the systemd service (if provided) to avoid restart loops
 - restarts the service and shows logs + /health check
"""
from __future__ import annotations
import argparse
import subprocess
import shlex
import time
import sys
import os
from typing import List, Tuple

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5000
DEFAULT_SERVICE = "futurefunded"

def run(cmd: str, check: bool = False) -> Tuple[int, str]:
    try:
        p = subprocess.run(shlex.split(cmd), capture_output=True, text=True, check=check)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, f"Command not found: {cmd}"
    except Exception as e:
        return 1, str(e)

def find_listeners(port: int, host: str = "127.0.0.1") -> List[Tuple[int,str]]:
    """Return list of (pid, cmdline) listening on port (best-effort using ss/lsof/netstat)."""
    out = []
    # Try ss first
    rc, txt = run(f"ss -ltnp 'sport = :{port}'")
    if rc == 0 and txt.strip():
        for line in txt.splitlines():
            # lines usually like: LISTEN 0 128 127.0.0.1:5000 *:* users:(("python",pid,fd))
            if "users:(" in line and ":" in line:
                try:
                    # crude parse for pid and program
                    if "pid=" in line:
                        # newer ss format: users:(("python",pid,fd))
                        import re
                        m = re.search(r'pid=(\d+),', line)
                        if m:
                            pid = int(m.group(1))
                            # attempt to get cmdline more reliably
                            rc2, cmd = run(f"ps -p {pid} -o pid= -o args=")
                            cmd = cmd.strip()
                            out.append((pid, cmd))
                            continue
                    # fallback: try extract between users:(("prog",pid,fd))
                    import re
                    m2 = re.search(r'users:\(\("([^"]+)",pid=(\d+),', line)
                    if m2:
                        pid = int(m2.group(2))
                        cmd = m2.group(1)
                        rc2, full = run(f"ps -p {pid} -o pid= -o args=")
                        out.append((pid, full.strip() or cmd))
                except Exception:
                    continue

    # If ss failed or returned nothing, try lsof
    if not out:
        rc, txt = run(f"lsof -i :{port} -sTCP:LISTEN -Pn")
        if rc == 0 and txt.strip():
            lines = txt.strip().splitlines()
            # skip header
            for line in lines[1:]:
                parts = line.split()
                # lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
                if len(parts) >= 2:
                    try:
                        pid = int(parts[1])
                        rc2, cmd = run(f"ps -p {pid} -o pid= -o args=")
                        out.append((pid, cmd.strip() or parts[0]))
                    except Exception:
                        continue

    # Last resort: netstat (very old systems)
    if not out:
        rc, txt = run(f"netstat -ltnp 2>/dev/null | grep :{port} || true")
        if rc == 0 and txt.strip():
            for line in txt.splitlines():
                try:
                    # parts may include 'pid/program'
                    if '/' in line:
                        maybe = line.split()[-1]
                        if '/' in maybe:
                            pid = int(maybe.split('/')[0])
                            rc2, cmd = run(f"ps -p {pid} -o pid= -o args=")
                            out.append((pid, cmd.strip()))
                except Exception:
                    continue
    # dedupe
    seen = set()
    filtered = []
    for pid, cmd in out:
        if pid in seen:
            continue
        seen.add(pid)
        filtered.append((pid, cmd))
    return filtered

def sigterm_then_kill(pid: int, timeout: int = 5) -> bool:
    """Send SIGTERM then wait, then SIGKILL if necessary. Returns True if process gone."""
    try:
        os.kill(pid, 15)  # SIGTERM
    except ProcessLookupError:
        return True
    except PermissionError:
        print(f"❌ No permission to kill PID {pid}")
        return False
    # wait
    for _ in range(timeout * 10):
        time.sleep(0.1)
        try:
            os.kill(pid, 0)
            # still alive
        except ProcessLookupError:
            return True
    # still alive -> kill
    try:
        os.kill(pid, 9)
    except Exception:
        return False
    # final check
    for _ in range(10):
        time.sleep(0.1)
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
    return False

def systemctl(cmd: str, service: str) -> Tuple[int,str]:
    return run(f"sudo systemctl {cmd} {service}")

def try_health_check(host: str, port: int) -> Tuple[int,str]:
    url = f"http://{host}:{port}/health"
    rc, txt = run(f"curl -fsS {shlex.quote(url)} || true")
    return rc, txt.strip()

def main():
    p = argparse.ArgumentParser(description="Find processes on a port, optionally kill them, restart a systemd service and check /health.")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("--service", default=DEFAULT_SERVICE, help="systemd service name to restart")
    p.add_argument("--auto-kill", action="store_true", help="If passed, will kill processes using the port (use with caution)")
    p.add_argument("--force-kill", action="store_true", help="After SIGTERM timeout, force kill with SIGKILL")
    args = p.parse_args()

    print(f"🔎 Inspecting listeners on {args.host}:{args.port} ...")
    listeners = find_listeners(args.port, args.host)
    if not listeners:
        print("✅ No listening process found on that port (best-effort).")
    else:
        print("⚠️ Found listening process(es):")
        for pid, cmd in listeners:
            print(f"  - PID {pid}: {cmd}")

    # stop the systemd service to avoid restart storms (non-fatal if fails)
    print(f"\n⏹ Stopping systemd service '{args.service}' (to avoid restart loops)...")
    rc, out = systemctl("stop", args.service)
    print(out.strip())

    if listeners and args.auto_kill:
        for pid, cmd in listeners:
            print(f"\n🪓 Attempting to terminate PID {pid} ({cmd})")
            ok = sigterm_then_kill(pid, timeout=5)
            if ok:
                print(f"✅ PID {pid} exited.")
            else:
                if args.force_kill:
                    try:
                        os.kill(pid, 9)
                        print(f"⚠️ Force killed PID {pid}.")
                    except Exception as e:
                        print(f"❌ Failed to force kill PID {pid}: {e}")
                else:
                    print(f"⚠️ PID {pid} still alive. Re-run with --force-kill to SIGKILL after timeout.")

    # start service
    print(f"\n▶️ Starting systemd service '{args.service}' ...")
    rc, out = systemctl("start", args.service)
    print(out.strip())
    time.sleep(1.2)
    print(f"\n📜 Recent journalctl logs (last 80 lines) for {args.service}:")
    rc, logs = run(f"sudo journalctl -u {args.service} -n 80 --no-pager")
    print(logs.strip()[:20000])

    # health check local
    print(f"\n🔬 Checking local /health at http://{args.host}:{args.port}/health ...")
    rc, health = try_health_check(args.host, args.port)
    if health:
        print("✅ /health response:")
        print(health)
    else:
        print("❌ /health returned no output (the service might not be listening).")
    print("\nDone.")

if __name__ == "__main__":
    main()

