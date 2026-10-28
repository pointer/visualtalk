#!/usr/bin/env python3
"""Build a Tauri app for a specific architecture and stage its release bundle.

Supported pnpm build scripts (and the resulting `--target` triple):

    mac:build            -> tauri build --target aarch64-apple-darwin
    mac:build:intel      -> tauri build --target x86_64-apple-darwin
    mac:build:universal -> tauri build --target universal-apple-darwin
    win:build            -> tauri build --target x86_64-pc-windows-msvc
    win:build:arm        -> tauri build --target aarch64-pc-windows-msvc
    linux:build          -> tauri build --target x86_64-unknown-linux-gnu
    linux:build:arm      -> tauri build --target aarch64-unknown-linux-gnu

For the chosen build, the script:
  1. runs the corresponding pnpm build,
  2. moves the content of the generated bundle directory
         <project>/src-tauri/target/<build-target>/release/bundle
     into a per-architecture subdirectory that it creates:
         C:/dev/vt/product-release/<build-target>

Afterwards the directory C:/dev/vt/product-release can be committed to GitHub.
"""

import argparse
import shutil
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(r"C:\dev\vt")
TARGET_ROOT = PROJECT_ROOT / "src-tauri" / "target"
BUNDLE_RELATIVE_PATH = Path("release") / "bundle"
PRODUCT_RELEASE_ROOT = PROJECT_ROOT / "product-release"

PNPM_SCRIPTS = {
    "mac:build": "aarch64-apple-darwin",
    "mac:build:intel": "x86_64-apple-darwin",
    "mac:build:universal": "universal-apple-darwin",
    "win:build": "x86_64-pc-windows-msvc",
    "win:build:arm": "aarch64-pc-windows-msvc",
    "linux:build": "x86_64-unknown-linux-gnu",
    "linux:build:arm": "aarch64-unknown-linux-gnu",
}


def run_build(pnpm_script: str) -> None:
    print(f"> Running pnpm build: {pnpm_script}")
    subprocess.run(f"pnpm run {pnpm_script}", cwd=str(PROJECT_ROOT), shell=True, check=True)
    print(f"> Build finished successfully: {pnpm_script}")


def move_bundle_content(build_target: str) -> Path:
    source = TARGET_ROOT / build_target / BUNDLE_RELATIVE_PATH
    destination = PRODUCT_RELEASE_ROOT / build_target

    if not source.is_dir():
        raise FileNotFoundError(f"Bundle directory not found: {source}")

    destination.mkdir(parents=True, exist_ok=True)

    for item in sorted(source.iterdir()):
        target_path = destination / item.name
        if target_path.is_dir():
            shutil.rmtree(target_path)
        elif target_path.exists():
            target_path.unlink()
        shutil.move(str(item), str(target_path))

    return destination


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a Tauri app via pnpm and move its release bundle "
        "into C:\\dev\\vt\\product-release\\<build-target>"
    )
    parser.add_argument(
        "pnpm_script",
        choices=sorted(PNPM_SCRIPTS),
        help="pnpm script to build, e.g. mac:build, win:build, linux:build:arm",
    )
    args = parser.parse_args()

    build_target = PNPM_SCRIPTS[args.pnpm_script]

    run_build(args.pnpm_script)
    destination = move_bundle_content(build_target)
    print(f"Moved bundle content to: {destination}")


if __name__ == "__main__":
    main()
