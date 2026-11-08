#!/usr/bin/env python3
"""
livekit-local.py — Python management script for VisualTalk's self-hosted LiveKit stack.

Usage:
    python3 scripts/livekit-local.py up [--recording] [--translation] [--host]
    python3 scripts/livekit-local.py restart [--recording] [--translation] [--host]
    python3 scripts/livekit-local.py smoke [--recording]
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
import json
import re
import shutil
import socket

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCKER_DIR = os.path.join(REPO_ROOT, "docker")
ENV_FILE = os.path.join(DOCKER_DIR, ".env")
ENV_EXAMPLE = os.path.join(DOCKER_DIR, ".env.example")
RECORDINGS_DIR = os.path.join(DOCKER_DIR, "recordings")
SERVER_CONTAINER = "visualtalk-livekit"
EGRESS_CONTAINER = "visualtalk-egress"
# How the docs and these messages tell the user to invoke us.
SELF = "python3 scripts/livekit-local.py"

def log(msg): print(f"[livekit] {msg}")
def warn(msg): print(f"[livekit] WARN: {msg}", file=sys.stderr)
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


def cmd_down(args):
    run_cmd(build_compose_cmd(args, ["down"]))


def wait_healthy(name, limit=120):
    """Block until the container reports healthy, or running if it has no probe."""
    for _ in range(limit):
        res = run_cmd(["docker", "inspect", "-f",
                       "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
                       name], check=False, capture_output=True)
        if res.returncode == 0 and res.stdout.strip() in ("healthy", "running"):
            return True
        time.sleep(1)
    return False


def cmd_restart(args):
    ensure_env()
    log("recreating containers (picks up docker/*.yaml and docker/.env edits)")
    run_cmd(build_compose_cmd(args, ["up", "-d", "--force-recreate", "--remove-orphans"]))
    log("waiting for healthy state...")
    if not wait_healthy(SERVER_CONTAINER):
        warn(f"{SERVER_CONTAINER} did not report healthy in time - see: {SELF} logs livekit")
    run_cmd(build_compose_cmd(args, ["ps"]))
    cmd_creds(args)


def cmd_status(args):
    run_cmd(build_compose_cmd(args, ["ps"]))


def cmd_logs(args):
    cmd = build_compose_cmd(args, ["logs"])
    if getattr(args, "follow", False): cmd.append("-f")
    if getattr(args, "service", None): cmd.append(args.service)
    run_cmd(cmd)


def read_env():
    if not os.path.exists(ENV_FILE):
        die("docker/.env missing - run 'up' first")
    vals = {}
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                vals[k] = v
    return vals


def load_env():
    """Export docker/.env into this process before invoking compose.

    Compose interpolation prefers the SHELL environment over the .env file, so a
    LIVEKIT_API_SECRET already exported in the user's shell silently wins for the
    server, while read_env() - which `creds` and `smoke` use - keeps reading the
    file. The two then disagree and every token the CLI mints fails with
    "signature is invalid", which looks exactly like a stale container.

    The removed .sh wrapper avoided this by sourcing the file
    (`set -a; . docker/.env; set +a`); this is the equivalent, and it keeps
    docker/.env the single source of truth the docs promise.
    """
    if not os.path.exists(ENV_FILE):
        return
    for k, v in read_env().items():
        os.environ[k] = v


def cmd_creds(args):
    vals = read_env()
    port = vals.get("LIVEKIT_PORT", "7880")
    node_ip = vals.get("LIVEKIT_NODE_IP", "127.0.0.1")
    log("LiveKit credentials (docker/.env):")
    print(f"  url (this machine):      ws://localhost:{port}")
    print(f"  url (android emulator):  ws://10.0.2.2:{port}")
    print(f"  LIVEKIT_NODE_IP:         {node_ip}")
    if node_ip in ("127.0.0.1", "localhost"):
        log("WARNING: NODE_IP is loopback - remote/emulator clients will be told to")
        log("         send media to their OWN loopback. Start with --host instead.")
    print(f"  LIVEKIT_API_KEY:         {vals.get('LIVEKIT_API_KEY')}")
    print(f"  LIVEKIT_API_SECRET:      {vals.get('LIVEKIT_API_SECRET')}")


def _lk(lk_args):
    """Run the `lk` CLI; returns (returncode, combined output)."""
    res = subprocess.run(["lk"] + lk_args, capture_output=True, text=True)
    return res.returncode, (res.stdout or "") + (res.stderr or "")


def _running_containers():
    res = subprocess.run(["docker", "ps", "--format", "{{.Names}}"],
                         capture_output=True, text=True)
    return res.stdout.split()


def _port_open(host, port, timeout=3):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def cmd_smoke(args):
    """End-to-end check: publish a demo participant, then record the room.

    Ported from the removed .sh wrapper. The throwaway room is deleted and the
    publisher killed in the finally block - the Python equivalent of the shell
    script's EXIT trap, which also has to run on the failure paths.
    """
    ensure_env()
    vals = read_env()
    if shutil.which("lk") is None:
        die("the 'lk' CLI is required for the smoke test (brew install livekit/tap/livekit-cli)")
    if SERVER_CONTAINER not in _running_containers():
        die(f"the server is not running - start it with: {SELF} up --recording")

    key = vals.get("LIVEKIT_API_KEY", "")
    secret = vals.get("LIVEKIT_API_SECRET", "")
    node_ip = vals.get("LIVEKIT_NODE_IP", "127.0.0.1")
    port = vals.get("LIVEKIT_PORT", "7880")

    # LIVEKIT_NODE_IP is what the server ADVERTISES to clients as its media (ICE)
    # candidate - not necessarily an address this machine can reach. Emulator
    # setups set it to 10.0.2.2, LAN setups to a Wi-Fi IP. The lk CLI runs here,
    # so connect over an address that actually answers, and be explicit about
    # which half of the test that leaves unverifiable.
    addr = node_ip
    media_verifiable = _port_open(node_ip, port)
    if not media_verifiable:
        if not _port_open("127.0.0.1", port):
            die(f"cannot reach the server at {node_ip}:{port} or 127.0.0.1:{port} - "
                f"is it running? ({SELF} status)")
        addr = "127.0.0.1"
        warn(f"LIVEKIT_NODE_IP={node_ip} is not reachable from this machine (it is the")
        warn("address advertised to clients, e.g. an emulator's 10.0.2.2). Signalling")
        warn("will be tested over 127.0.0.1. Media may still flow - the server opens")
        warn("ICE toward the publisher - but if a media step below fails, this is why.")
    ws, http = f"ws://{addr}:{port}", f"http://{addr}:{port}"
    room = f"vt-smoke-{int(time.time())}"
    pub = None
    try:
        log(f"1/3 publishing a demo participant into '{room}' via {ws}")
        pub = subprocess.Popen(
            ["lk", "room", "join", "--url", ws, "--api-key", key, "--api-secret", secret,
             "--identity", "smoke-pub", "--room", room, "--publish-demo"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        time.sleep(10)
        if pub.poll() is not None:
            raw = (pub.communicate()[0] or "").strip()
            # Recognised failure: name the cause instead of dumping lk's Go stack
            # trace. The usual reason is a container that predates the current
            # docker/.env, so it still holds the old key pair.
            if "signature is invalid" in raw or "unauthorized" in raw:
                die("the server rejected these credentials. The running container was "
                    "most likely started before docker/.env last changed, so it still "
                    "holds the old key pair - fix with: "
                    f"{SELF} restart --recording")
            for line in raw.splitlines()[-12:]:
                print(f"    {line}")
            die("the demo publisher exited early - see its output above")

        log("2/3 verifying the participant joined and is active")
        _, out = _lk(["room", "participants", "list", room, "--url", http,
                      "--api-key", key, "--api-secret", secret])
        for line in out.splitlines():
            if "Using api-key" not in line:
                print(f"    {line}")
        if "smoke-pub" not in out:
            die("smoke-pub is not in the room - signalling or media failed")

        passed = ("signalling + media" if media_verifiable
                  else "signalling only - media NOT verified, see the warning above")
        if EGRESS_CONTAINER not in _running_containers():
            if getattr(args, "recording", False):
                die(f"--recording was requested but egress is not running - "
                    f"start it with: {SELF} up --recording")
            warn(f"3/3 skipped: egress is not running (start it with: {SELF} up --recording)")
            log(f"smoke test passed ({passed})")
            return

        _smoke_record(room, http, key, secret, vals)
    finally:
        if pub is not None and pub.poll() is None:
            pub.kill()
            pub.wait()
        # Best effort: a leftover throwaway room would confuse the next run.
        _lk(["room", "delete", room, "--url", http,
             "--api-key", key, "--api-secret", secret])


def _smoke_record(room, http, key, secret, vals):
    """Step 3/3: start a room composite, record 20 s, then verify the file."""
    rec_dir = vals.get("LIVEKIT_RECORDINGS_DIR", "./recordings")
    if not os.path.isabs(rec_dir):
        rec_dir = os.path.join(DOCKER_DIR, os.path.relpath(rec_dir, "."))
    name = f"smoke-{int(time.time())}.mp4"
    host_file = os.path.join(rec_dir, name)
    log(f"3/3 recording the room (grid layout) to /recordings/{name}")
    payload = json.dumps({"room_name": room, "layout": "grid",
                          "file_outputs": [{"filepath": f"/recordings/{name}",
                                            "file_type": "MP4"}]})
    rc, out = _lk(["egress", "start", "--type", "room-composite", "--url", http,
                   "--api-key", key, "--api-secret", secret, payload])
    if rc != 0:
        die(f"lk egress start failed: {out}")
    m = re.search(r"EG_[A-Za-z0-9]*", out)
    if not m:
        die(f"no egress ID in the response: {out}")
    egress_id = m.group(0)
    log(f"    {egress_id} started - recording for 20s")
    time.sleep(20)
    _lk(["egress", "stop", "--id", egress_id, "--url", http,
         "--api-key", key, "--api-secret", secret])
    log("    waiting for the file to be finalised")
    for _ in range(40):
        if os.path.exists(host_file) and os.path.getsize(host_file) > 0:
            break
        time.sleep(1)

    if os.path.exists(host_file) and os.path.getsize(host_file) > 0:
        log(f"recording OK: {host_file} ({os.path.getsize(host_file) / 1048576:.1f}M)")
        if shutil.which("ffprobe"):
            res = subprocess.run(
                ["ffprobe", "-v", "error",
                 "-show_entries", "stream=codec_name,width,height",
                 "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1", host_file],
                capture_output=True, text=True)
            for line in res.stdout.splitlines():
                print(f"    {line}")
        log("smoke test passed (signalling + media + recording)")
        return

    warn(f"no recording appeared at {host_file}")
    _, out = _lk(["egress", "list", "--url", http, "--api-key", key, "--api-secret", secret])
    for line in out.splitlines():
        if egress_id in line:
            print(f"    {line}")
    res = subprocess.run(["docker", "logs", "--tail", "80", EGRESS_CONTAINER],
                         capture_output=True, text=True)
    for line in [l for l in (res.stdout + res.stderr).splitlines()
                 if re.search(r"error|abort|failed", l, re.I)][-6:]:
        print(f"    {line}")
    warn("common causes:")
    warn("  1. egress could not negotiate media with the server - rtc.use_mdns must")
    warn("     stay 'true' in docker/livekit.yaml (Chrome hides its host candidate otherwise)")
    warn("  2. docker/recordings was deleted while the stack was running (stale inode) -")
    warn(f"     fix with: {SELF} restart --recording")
    die(f"smoke test FAILED at the recording step - full logs: {SELF} logs egress")


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    up_p = subparsers.add_parser("up")
    up_p.add_argument("-r", "--recording", action="store_true")
    up_p.add_argument("-t", "--translation", action="store_true")
    up_p.add_argument("--host", action="store_true")
    # Same profile flags as `up`: restart recreates whatever the stack was started
    # with, so it has to be able to name the same profiles.
    restart_p = subparsers.add_parser("restart")
    restart_p.add_argument("-r", "--recording", action="store_true")
    restart_p.add_argument("-t", "--translation", action="store_true")
    restart_p.add_argument("--host", action="store_true")
    smoke_p = subparsers.add_parser("smoke", aliases=["test"])
    smoke_p.add_argument("-r", "--recording", action="store_true",
                         help="fail instead of skipping when egress is not running")
    smoke_p.add_argument("--host", action="store_true")
    subparsers.add_parser("down")
    subparsers.add_parser("status")
    logs_p = subparsers.add_parser("logs")
    logs_p.add_argument("-f", "--follow", action="store_true")
    logs_p.add_argument("service", nargs="?")
    subparsers.add_parser("creds")

    args, extra = parser.parse_known_args()
    if args.command == "up": cmd_up(args)
    elif args.command == "restart": cmd_restart(args)
    elif args.command in ("smoke", "test"): cmd_smoke(args)
    elif args.command == "down": cmd_down(args)
    elif args.command == "status": cmd_status(args)
    elif args.command == "logs": cmd_logs(args)
    elif args.command == "creds": cmd_creds(args)
    else: parser.print_help(); sys.exit(1)


def build_compose_cmd(args, extra_docker_args=None):
    # Every compose invocation must see docker/.env as the authority - see
    # load_env(). Without this a shell-exported LIVEKIT_* variable quietly
    # configures the server with credentials the rest of this script disagrees
    # with.
    load_env()
    cmd = ["docker", "compose", "-f", os.path.join(DOCKER_DIR, "docker-compose.yml")]
    if getattr(args, "host", False): cmd.extend(["-f", os.path.join(DOCKER_DIR, "compose.host.yml")])
    if getattr(args, "recording", False): cmd.extend(["--profile", "recording"])
    if getattr(args, "translation", False): cmd.extend(["--profile", "translation"])
    if extra_docker_args: cmd.extend(extra_docker_args)
    return cmd


# Defined last on purpose: every helper above must exist before the entry point
# runs. The .sh-to-.py migration originally placed this block above
# build_compose_cmd, which made `up` die with NameError on first use.
if __name__ == "__main__":
    main()
