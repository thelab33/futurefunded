#!/usr/bin/env python3
"""
tools/fix_port_and_restart_safe.py

Safer tool to inspect listeners and (optionally) kill user-level processes.
Key safety rules:
 - Never kill PID 1.
 - Never kill PIDs <= 100 unless --danger is passed.
 - Blacklist common system services (containerd, postgres, mariadb, cloudflared, systemd, init, sshd, docker, nginx, gunicorn, rabbitmq).
 - Requires both --auto-kill AND --confirm to actually terminate processes.
 - To force-kill blacklisted/low-pid processes you must pass --danger (not recommended).

Usage:
  python tools/fix_port_and_restart_safe.py            # inspect only
  sudo python tools/fix_port_and_restart_safe.py --auto-kill --confirm --service futurefunded
"""
from __future__ import annotations
import argparse, shlex, subprocess, os, time, re
from typing import List, Tuple

BLACKLIST_NAMES = {
    "containerd","systemd","init","sshd","postgres","postgresql","mariadb","mysqld",
    "cloudflared","docker","nginx","gunicorn","rabbitmq","beam.smp"
}
MIN_SAFE_PID = 101  # do not touch <=100 by default

def run(cmd: str):
    return subprocess.run(shlex.split(cmd), capture_output=True, text=True)

def find_listeners(port: int) -> List[Tuple[int,str]]:
    out=[]
    rs=run(f"ss -ltnp 'sport = :{port}'")
    txt = rs.stdout + rs.stderr
    for line in txt.splitlines():
        if "pid=" in line:
            m = re.search(r'pid=(\d+),', line)
            if m:
                pid=int(m.group(1))
                p = run(f"ps -p {pid} -o pid= -o args=")
                out.append((pid, p.stdout.strip() or "<unknown>"))
    if not out:
        rs = run(f"lsof -i :{port} -sTCP:LISTEN -Pn")
        txt = rs.stdout + rs.stderr
        for i, line in enumerate(txt.splitlines()):
            if i==0: continue
            parts=line.split()
            try:
                pid=int(parts[1])
                p = run(f"ps -p {pid} -o pid= -o args=")
                out.append((pid, p.stdout.strip() or parts[0]))
            except:
                continue
    # dedupe
    seen=set(); filtered=[]
    for pid, cmd in out:
        if pid in seen: continue
        seen.add(pid); filtered.append((pid, cmd))
    return filtered

def is_blacklisted_cmd(cmdline: str):
    for name in BLACKLIST_NAMES:
        if name in cmdline:
            return True
    return False

def sigterm_then_kill(pid:int, timeout=5, force=False):
    try:
        os.kill(pid, 15)
    except Exception:
        return False
    for _ in range(timeout*10):
        time.sleep(0.1)
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
    if force:
        try:
            os.kill(pid, 9)
            return True
        except Exception:
            return False
    return False

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=5000)
    p.add_argument("--service", default="futurefunded")
    p.add_argument("--auto-kill", action="store_true")
    p.add_argument("--confirm", action="store_true", help="double confirmation for destructive actions")
    p.add_argument("--force-kill", action="store_true")
    p.add_argument("--danger", action="store_true", help="allow killing blacklisted or low-numbered PIDs (use with extreme care)")
    args = p.parse_args()

    print(f"Inspecting listeners on port {args.port} ...")
    listeners = find_listeners(args.port)
    if not listeners:
        print("No listeners found.")
    else:
        print("Found listeners:")
        for pid, cmd in listeners:
            tag = []
            if pid == 1: tag.append("PID1")
            if pid <= MIN_SAFE_PID: tag.append(f"low-pid({pid})")
            if is_blacklisted_cmd(cmd): tag.append("BLACKLIST")
            print(f"  - PID {pid}: {cmd} {' '.join(tag)}")

    print("\nStopping systemd service (soft stop) to avoid restart loops...")
    subprocess.run(["sudo","systemctl","stop", args.service])

    if args.auto_kill:
        if not args.confirm:
            print("Refusing to auto-kill: pass both --auto-kill AND --confirm to proceed.")
            return
        for pid, cmd in listeners:
            if pid == 1:
                print(f"Refusing to kill PID 1: {cmd}")
                continue
            if pid <= MIN_SAFE_PID and not args.danger:
                print(f"Refusing to kill low-numbered PID {pid} (use --danger to override).")
                continue
            if is_blacklisted_cmd(cmd) and not args.danger:
                print(f"Refusing to kill blacklisted process PID {pid} ({cmd}) — use --danger to override.")
                continue
            print(f"Attempting graceful stop of PID {pid} ...")
            ok = sigterm_then_kill(pid, timeout=5, force=args.force_kill)
            print(" ->", "gone" if ok else "still alive")
    else:
        print("Not auto-killing (inspect-only).")

    print("\nStarting systemd service back up:")
    subprocess.run(["sudo","systemctl","start", args.service])
    print("Done.")

if __name__ == '__main__':
    main()
