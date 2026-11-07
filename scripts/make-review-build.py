#!/usr/bin/env python3
"""Build an App Store review IPA with explicitly supplied demo credentials.

The demo credentials are embedded in the resulting IPA and are recoverable by
anyone who obtains it. Use a dedicated LiveKit project with a spend cap and
rotate its API key and secret after App Review.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import BinaryIO


ROOT = Path(__file__).resolve().parents[1]
REVIEW_ENV_KEYS = (
    ("VISUALTALK_DEMO_LIVEKIT_URL", "url"),
    ("VISUALTALK_DEMO_API_KEY", "api_key"),
    ("VISUALTALK_DEMO_API_SECRET", "api_secret"),
)
CREDS_FILE = ROOT / ".review-creds.sh"
IPA_DIR = ROOT / "src-tauri/gen/apple/build"


def parse_args() -> tuple[argparse.Namespace, list[str]]:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="resolve credentials without building")
    parser.add_argument("--pro", action="store_true", help="build the Pro Edition review IPA")
    args, passthrough = parser.parse_known_args()
    return args, passthrough


def resolve_credentials(config_path: Path, env: dict[str, str]) -> dict[str, str]:
    if all(env.get(name) for name, _ in REVIEW_ENV_KEYS):
        return {name: env[name] for name, _ in REVIEW_ENV_KEYS}

    if not config_path.is_file():
        raise RuntimeError(
            "error: no demo credentials.\n"
            "  Set VISUALTALK_DEMO_LIVEKIT_URL / _API_KEY / _API_SECRET,\n"
            "  or configure a server in Settings → LiveKit (expected at:\n"
            f"  {config_path})."
        )

    print(f"Reading demo credentials from {config_path}")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))["livekit_config"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise RuntimeError(f"error: could not read LiveKit credentials from {config_path}: {error}") from error

    resolved: dict[str, str] = {}
    for env_name, config_key in REVIEW_ENV_KEYS:
        value = str(config.get(config_key) or "").strip()
        if not value:
            raise RuntimeError(f"error: {config_key} is empty in {config_path}")
        resolved[env_name] = value
    return resolved


def write_credentials_file(credentials: dict[str, str]) -> None:
    assignments = "".join(f"export {name}={shlex.quote(credentials[name])}\n" for name, _ in REVIEW_ENV_KEYS)
    descriptor = os.open(CREDS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(assignments)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise
    CREDS_FILE.chmod(0o600)


def contains_bytes(stream: BinaryIO, needle: bytes) -> bool:
    overlap = b""
    while chunk := stream.read(1024 * 1024):
        data = overlap + chunk
        if needle in data:
            return True
        overlap = data[-max(0, len(needle) - 1):] if len(needle) > 1 else b""
    return False


def verify_latest_ipa(api_key: str) -> None:
    try:
        ipa_paths = list(IPA_DIR.rglob("*.ipa"))
        ipa_path = max(ipa_paths, key=lambda path: path.stat().st_mtime) if ipa_paths else None
    except OSError:
        ipa_path = None
    if ipa_path is None:
        print("note: could not locate the exported IPA to verify — check it manually.", file=sys.stderr)
        return

    try:
        with zipfile.ZipFile(ipa_path) as ipa:
            app_binary = next(
                (
                    member
                    for member in ipa.namelist()
                    if member.startswith("Payload/")
                    and ".app/" in member
                    and member.rsplit("/", 1)[-1] == member.split("/", 2)[1][:-4]
                ),
                None,
            )
            if app_binary and contains_bytes(ipa.open(app_binary), api_key.encode()):
                print(f"Verified: demo credentials are present in {ipa_path}.")
                return
    except (OSError, zipfile.BadZipFile, KeyError) as error:
        print(f"WARNING: could not inspect {ipa_path}: {error}", file=sys.stderr)
        return

    print(f"WARNING: demo API key not found in {ipa_path}.", file=sys.stderr)
    print("         The build may have reused a cached object. Retry with:", file=sys.stderr)
    print(f"           cargo clean -p visualtalk && python3 {Path(__file__).name}", file=sys.stderr)


def main() -> int:
    args, passthrough = parse_args()
    env = os.environ.copy()
    try:
        config_name = "tauri.pro.conf.json" if args.pro else "tauri.conf.json"
        config = json.loads((ROOT / "src-tauri" / config_name).read_text(encoding="utf-8"))
        identifier = config["identifier"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"error: could not resolve app identifier: {error}", file=sys.stderr)
        return 1

    livekit_path = (
        Path.home()
        / "Library/Application Support"
        / identifier
        / "livekit.json"
    )

    if args.pro:
        if not args.check:
            result = subprocess.run([sys.executable, str(ROOT / "scripts/setup-pro.py")], cwd=ROOT)
            if result.returncode:
                return result.returncode
        env["VITE_EDITION"] = "pro"
        env["VITE_ENABLE_E2EE"] = "true"
        tauri_extra = ["--config", "src-tauri/tauri.pro.conf.json"]
        if not any(token in ("e2ee", "pro") for token in passthrough):
            passthrough.extend(["--", "--features", "pro"])
    else:
        tauri_extra = []

    try:
        credentials = resolve_credentials(livekit_path, env)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    for name, _ in REVIEW_ENV_KEYS:
        if not credentials.get(name):
            print(
                f"error: {name} resolved empty — refusing to build a review IPA that\n"
                "       would only fail at runtime, in front of the reviewer.",
                file=sys.stderr,
            )
            return 1
        env[name] = credentials[name]

    print(f"Edition      : {identifier}")
    print(f"Demo project : {credentials['VISUALTALK_DEMO_LIVEKIT_URL']}")
    print(f"Demo API key : {credentials['VISUALTALK_DEMO_API_KEY']}")
    print(f"Demo secret  : ({len(credentials['VISUALTALK_DEMO_API_SECRET'])} chars, not printed)")
    if args.check:
        print("OK: credentials resolved. Nothing built (--check).")
        return 0

    try:
        write_credentials_file(credentials)
    except OSError as error:
        print(f"error: could not create protected Xcode credentials file: {error}", file=sys.stderr)
        return 1

    try:
        print("\nBuilding App Store Connect IPA with demo credentials…", flush=True)
        command = [
            "pnpm",
            "tauri",
            "ios",
            "build",
            "--export-method",
            "app-store-connect",
            *tauri_extra,
            *passthrough,
        ]
        subprocess.run(command, cwd=ROOT, env=env, check=True)
        verify_latest_ipa(credentials["VISUALTALK_DEMO_API_KEY"])
        print(
            "\n──────────────────────────────────────────────────────────────────────────────\n"
            " REMINDER: the credentials in this IPA are recoverable by anyone who has it.\n"
            " Rotate the LiveKit API key and secret once App Review approves the build, and\n"
            " do not reuse this IPA for a later submission.\n"
            "──────────────────────────────────────────────────────────────────────────────"
        )
        if args.pro:
            print("\nNOTE: the Pro E2EE implementation is still installed at src/e2ee.rs.")
            print("      Run python3 scripts/setup-pro.py --revert before committing CE changes.")
    except FileNotFoundError:
        print("error: pnpm not found; install pnpm and ensure it is on PATH.", file=sys.stderr)
        return 127
    except subprocess.CalledProcessError as error:
        return error.returncode or 1
    finally:
        try:
            CREDS_FILE.unlink(missing_ok=True)
        except OSError as error:
            print(f"warning: could not remove protected credentials file {CREDS_FILE}: {error}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
