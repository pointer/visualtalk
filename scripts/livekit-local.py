#!/usr/bin/env python3
"""
livekit-local.py — Python management script for VisualTalk's self-hosted LiveKit stack.

Usage:
    python3 scripts/livekit-local.py up [--recording] [--translation] [--host]
    python3 scripts/livekit-local.py down
    python3 scripts/livekit-local.py status
    python3 scripts/livekit-local.py logs [-f] [service]
    python3 scripts/livekit-local.py creds
"""

import sys
import os
import argparse
import subprocess
import secrets
import string
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCKER_DIR = os.path.join(REPO_ROOT, "docker")
ENV_FILE = os.path.join(DOCKER_DIR, ".env")
ENV_EXAMPLE = os.path.join(DOCKER_DIR, ".env.example")
RECORDINGS_DIR = os.path.join(DOCKER_DIR, "recordings")

def log(msg): print(f"[livekit] {msg}")
def die(msg): print(f"[livekit] ERROR: {msg}", file=sys.stderr); sys.exit(1)

def run_cmd(cmd, check=True, capture_output=False, text=True):
    try:
        return subprocess.run(cmd, check=check, capture_output=capture_output, text=text)
    except subprocess.CalledProcessError as e:
        if check: die(f"Command failed: {' '.join(cmd)}\n{e.stderr or ''}")
        return e

def ensure_env():
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    if not os.path.exists(ENV_FILE):
        log("creating docker/.env with a fresh API key pair...")
        key = "vt-" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        secret = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        with open(ENV_EXAMPLE, "r") as f: content = f.read()
        content = content.replace("LIVEKIT_API_KEY=devkey", f"LIVEKIT_API_KEY={key}")
        content = content.replace("LIVEKIT_API_SECRET=devsecretdevsecretdevsecretdevsec", f"LIVEKIT_API_SECRET={secret}")
        with open(ENV_FILE, "w") as f: f.write(content)
        os.chmod(ENV_FILE, 0o600)


def cmd_up(args):
    ensure_env()
    log("starting local LiveKit stack...")
    run_cmd(build_compose_cmd(args, ["up", "-d", "--remove-orphans"]))
    log("waiting for healthy state...")
    for _ in range(30):
        res = run_cmd(["docker", "inspect", "-f", "{{.State.Health.Status}}", "visualtalk-livekit"], check=False, capture_output=True)
        if res.returncode == 0 and res.stdout.strip() == "healthy": break
        time.sleep(1)

def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    up_p = subparsers.add_parser("up")
    up_p.add_argument("-r", "--recording", action="store_true")
    up_p.add_argument("-t", "--translation", action="store_true")
    up_p.add_argument("--host", action="store_true")
    
    args, extra = parser.parse_known_args()
    if args.command == "up": cmd_up(args)
    else: print("Use 'up' to start. Commands are expanding...")

if __name__ == "__main__":
    main()

def build_compose_cmd(args, extra_docker_args=None):
    cmd = ["docker", "compose", "-f", os.path.join(DOCKER_DIR, "docker-compose.yml")]
    if getattr(args, "host", False): cmd.extend(["-f", os.path.join(DOCKER_DIR, "compose.host.yml")])
    if getattr(args, "recording", False): cmd.extend(["--profile", "recording"])
    if getattr(args, "translation", False): cmd.extend(["--profile", "translation"])
    if extra_docker_args: cmd.extend(extra_docker_args)
    return cmd
