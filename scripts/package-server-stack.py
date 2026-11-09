#!/usr/bin/env python3
"""Package the self-hosted server stack as a release artifact.

Produces product-release/visualtalk-server-<version>.zip: the docker/ stack
(compose files, configs, auditable Dockerfile, .env.example), the
livekit-local.py wrapper and a standalone README, laid out exactly like the
repository so the wrapper's path assumptions hold after unzipping.

Why an allowlist and not "zip the docker directory": docker/ also holds the
owner's real docker/.env and binary egress recordings. An allowlist makes it
impossible for either to enter a public artifact, and the script double-checks
by refusing any entry whose name suggests credentials or media.

Images and model weights are deliberately NOT included (they are pulled or
built at runtime); the README says so.

Usage
-----
    python3 scripts/package-server-stack.py                 # version from tauri.conf.json
    python3 scripts/package-server-stack.py --version 3.3.44
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Repo-relative paths that go into the bundle, verbatim.
ALLOWLIST = (
    "docker/docker-compose.yml",
    "docker/compose.host.yml",
    "docker/livekit.yaml",
    "docker/egress.yaml",
    "docker/Dockerfile",
    "docker/.env.example",
    "scripts/livekit-local.py",
)

# Rendered from this template into the bundle's top-level README.md.
README_TEMPLATE = "docker/bundle-readme.md"

FORBIDDEN_FRAGMENTS = ("recordings", ".env", "secret", "credential", ".mp4", ".json.sidecar")


def version_from_conf() -> str:
    conf = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text())
    return conf["version"]


def is_safe(name: str) -> bool:
    lowered = name.lower()
    if lowered.endswith(".env.example"):
        return True  # the template, not credentials
    return not any(frag in lowered for frag in FORBIDDEN_FRAGMENTS)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", default=None)
    ap.add_argument("--out-dir", default=str(ROOT / "product-release"))
    args = ap.parse_args()

    version = args.version or version_from_conf()
    top = f"visualtalk-server-{version}"
    out = Path(args.out_dir) / f"{top}.zip"
    out.parent.mkdir(parents=True, exist_ok=True)

    readme = (ROOT / README_TEMPLATE).read_text().replace("{{VERSION}}", version)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{top}/README.md", readme)
        for rel in ALLOWLIST:
            src = ROOT / rel
            if not src.is_file():
                print(f"❌ missing from repo: {rel}", file=sys.stderr)
                return 1
            arcname = f"{top}/{rel}"
            if not is_safe(arcname):
                print(f"❌ refused (looks like credentials/media): {arcname}", file=sys.stderr)
                return 1
            zf.write(src, arcname)
        names = zf.namelist()

    # Belt and braces: re-open and scan what actually landed in the archive.
    with zipfile.ZipFile(out) as zf:
        for name in zf.namelist():
            if not is_safe(name):
                out.unlink(missing_ok=True)
                print(f"❌ archive contained forbidden entry {name}; deleted", file=sys.stderr)
                return 1
        names = zf.namelist()

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"✓ {out} ({out.stat().st_size / 1024:.1f} KiB, {len(names)} entries)")
    print(f"  sha256 {digest}")
    for name in sorted(names):
        print(f"    {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
