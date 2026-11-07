#!/usr/bin/env python3
"""Re-apply local iOS project fixes after ``tauri ios init``."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APPLE_DIR = ROOT / "src-tauri/gen/apple"
PROJECT_YML = APPLE_DIR / "project.yml"
TAURI_CONF = ROOT / "src-tauri/tauri.conf.json"
SYNC_ICONS = ROOT / "scripts/sync-ios-icons.py"
BUILD_PHASE = (
    'cd "$SRCROOT/../../.." && '
    "if [ -f .review-creds.sh ]; then . ./.review-creds.sh; fi && "
    "pnpm tauri ios xcode-script"
)
BUILD_PHASE_PATTERN = re.compile(
    r'(?:cd "\$SRCROOT/\.\./\.\./\.\." && )?'
    r"(?:if \[ -f \.review-creds\.sh \]; then "
    r"\. \./\.review-creds\.sh; fi && )?"
    r'pnpm\s+(?:--dir\s+"[^"]*"\s+)?tauri\s+ios\s+xcode-script'
)


def locate_base(lines: list[str]) -> tuple[int, int] | None:
    """Return the line span for ``settingGroups.app.base``."""

    def find(wanted: str, start: int) -> int | None:
        return next((n for n in range(start, len(lines)) if lines[n].rstrip() == wanted), None)

    index = find("settingGroups:", 0)
    if index is None:
        return None
    index = find("  app:", index + 1)
    if index is None:
        return None
    index = find("    base:", index + 1)
    if index is None:
        return None
    end = index + 1
    while end < len(lines) and (lines[end].startswith("      ") or not lines[end].strip()):
        end += 1
    return index + 1, end


def set_kv(body: list[str], key: str, value: str, changes: list[str], after: str | None = None) -> None:
    for index, line in enumerate(body):
        match = re.match(r"\s*" + re.escape(key) + r"\s*:\s*(.*)$", line)
        if match:
            if match.group(1).strip() != value:
                changes.append(f"{key}: {match.group(1).strip() or '(empty)'} -> {value}")
                body[index] = f"      {key}: {value}"
            return
    position = len(body) - 1
    if after:
        for index, line in enumerate(body):
            if re.match(r"\s*" + re.escape(after) + r"\s*:", line):
                position = index
                break
    changes.append(f"{key}: (absent) -> {value}")
    body.insert(position + 1, f"      {key}: {value}")


def patch_project(team: str, check_only: bool) -> list[str]:
    try:
        source = PROJECT_YML.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"❌ Could not read {PROJECT_YML}: {error}") from error
    lines = source.split("\n")
    changes: list[str] = []

    span = locate_base(lines)
    if span is None:
        changes.append("MISSING settingGroups.app.base - cannot patch signing")
    else:
        start, end = span
        body = lines[start:end]
        set_kv(body, "DEVELOPMENT_TEAM", team, changes)
        set_kv(body, "CODE_SIGN_STYLE", "Automatic", changes, after="DEVELOPMENT_TEAM")
        set_kv(body, "CODE_SIGN_IDENTITY", "Apple Development", changes, after="CODE_SIGN_STYLE")
        lines[start:end] = body

    for index, line in enumerate(lines):
        if line.rstrip() == "      - path: Externals":
            following = lines[index + 1] if index + 1 < len(lines) else ""
            if "excludes:" not in following:
                changes.append('Externals: add excludes ["**/*.a"]')
                lines.insert(index + 1, '        excludes: ["**/*.a"]')
            break

    found = False
    for index, line in enumerate(lines):
        if "tauri ios xcode-script" in line:
            found = True
            if BUILD_PHASE not in line:
                changes.append(
                    "Build Rust Code: anchor to repo root (pnpm --dir is broken on pnpm 9 and 12) "
                    "and source .review-creds.sh so review-build demo credentials reach cargo "
                    "despite Xcode phase env sanitizing"
                )
                lines[index] = BUILD_PHASE_PATTERN.sub(BUILD_PHASE, line, count=1)
            break
    if not found:
        changes.append("MISSING `tauri ios xcode-script` phase - cannot patch pnpm")

    output = "\n".join(lines)
    if changes and not check_only and output != source:
        PROJECT_YML.write_text(output, encoding="utf-8")
    return changes


def get_known_teams() -> list[str]:
    try:
        certificates = subprocess.run(
            ["security", "find-certificate", "-a", "-c", "Apple Development", "-p"],
            check=False,
            capture_output=True,
        ).stdout
    except OSError:
        return []

    teams: list[str] = []
    with tempfile.TemporaryDirectory(prefix="visualtalk-certs-") as temp_dir:
        for index, match in enumerate(
            re.finditer(
                rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
                certificates,
                re.DOTALL,
            )
        ):
            cert_path = Path(temp_dir) / f"c{index}.pem"
            cert_path.write_bytes(match.group(0) + b"\n")
            try:
                result = subprocess.run(
                    ["openssl", "x509", "-noout", "-subject", "-in", str(cert_path)],
                    check=False,
                    capture_output=True,
                    text=True,
                )
            except OSError:
                return []
            if result.returncode:
                continue
            match_ou = re.search(r"\bOU\s*=\s*([A-Za-z0-9]+)", result.stdout)
            if match_ou and match_ou.group(1) not in teams:
                teams.append(match_ou.group(1))
    return teams


def resolve_team() -> str:
    team = os.environ.get("APPLE_DEVELOPMENT_TEAM", "")
    if not team:
        try:
            config = json.loads(TAURI_CONF.read_text(encoding="utf-8"))
            team = ((config.get("bundle") or {}).get("iOS") or {}).get("developmentTeam") or ""
        except (OSError, json.JSONDecodeError):
            team = ""
    if not team:
        raise RuntimeError(
            "❌ Could not resolve a Team ID.\n"
            "   Set APPLE_DEVELOPMENT_TEAM, or bundle.iOS.developmentTeam in\n"
            "   src-tauri/tauri.conf.json, to your Team ID.\n"
            "   Find it in Xcode > Settings > Accounts > your Apple ID > Team."
        )
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        raise RuntimeError(
            f"❌ '{team}' does not look like a Team ID\n"
            "   (expected exactly 10 uppercase letters/digits).\n\n"
            "   Read the real Team ID off your signing certificate's OU field:\n"
            "     security find-certificate -a -c 'Apple Development' -p \\\n"
            "       | openssl x509 -noout -subject\n"
            "   The value you want is OU=..., NOT the (...) inside CN=."
        )
    return team


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift only (exit 1 if any)")
    parser.add_argument("--no-xcodegen", action="store_true", help="patch project.yml only")
    args = parser.parse_args()
    check_only = args.check
    run_xcodegen = not (args.check or args.no_xcodegen)

    if not PROJECT_YML.is_file():
        print(f"❌ {PROJECT_YML} not found.")
        print("   Run 'pnpm ios:init' first (this script is hooked into it).")
        return 1

    try:
        team = resolve_team()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    known_teams = get_known_teams()
    if known_teams and team not in known_teams:
        print(f"❌ '{team}' is not a Team ID on any installed Apple Development certificate.")
        print(f"\n   Team IDs found on your certificates: {' '.join(known_teams)}\n")
        print("   If you meant the identifier in the certificate CN parentheses,")
        print("   that is your personal Apple ID, not a Team ID — Xcode rejects it")
        print("   with 'No Account for Team'. Use one of the values above.")
        print("\n   Update it in ~/.zshrc (APPLE_DEVELOPMENT_TEAM) and/or")
        print("   src-tauri/tauri.conf.json (bundle.iOS.developmentTeam).")
        return 1
    if not known_teams and not check_only:
        print(f"⚠️  No Apple Development certificates found; cannot verify that\n   '{team}' is a real Team ID. Proceeding on trust.")

    try:
        changes = patch_project(team, check_only)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    if changes:
        if check_only:
            print("⚠️  project.yml has drifted from the local iOS fixes:")
            for change in changes:
                print(f"     • {change}")
            print("\n   Re-apply with: python3 scripts/fix-ios-project.py")
            return 1
        print(f"🔧 Patched {PROJECT_YML}:")
        for change in changes:
            print(f"     • {change}")
    else:
        print(f"✅ project.yml already correct (Team {team}).")
        if check_only:
            return 0

    subprocess.run(
        [sys.executable, str(SYNC_ICONS), *(["--check"] if check_only else [])],
        check=True,
    )

    if run_xcodegen:
        if shutil.which("xcodegen") is None:
            print("❌ xcodegen not found — install with: brew install xcodegen")
            print("   project.yml was patched, but the .xcodeproj still carries the old")
            print("   settings. Re-run this script once xcodegen is available.")
            return 1
        print("⚙️  Regenerating visualtalk.xcodeproj …")
        subprocess.run(["xcodegen", "generate"], cwd=APPLE_DIR, check=True, stdout=subprocess.DEVNULL)
        print(f"✅ Regenerated {APPLE_DIR}/visualtalk.xcodeproj")

    print("\nNext: pnpm ios:dev   (or pnpm ios:build)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode or 1)
