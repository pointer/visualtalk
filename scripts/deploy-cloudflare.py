#!/usr/bin/env python3
"""Build and upload VisualTalk artifacts to Cloudflare (Pages + R2).

Why this script exists
----------------------
Cloudflare's build environment cannot build this project. Its container ships
Node and a package manager only: there is no Rust toolchain, so ``tauri build``
dies on its very first step with

    failed to run command cargo metadata --no-deps --format-version 1:
    No such file or directory (os error 2)

and there is no Xcode / WebKitGTK / Windows SDK either, so even with cargo
present no bundle could be produced. A Tauri build output is also a *native*
binary (.app/.dmg/.exe/.AppImage) — Cloudflare serves HTTP, it cannot run one.

So artifacts are built HERE (or in GitHub Actions, see docs/cloudflare-deploy.md)
and only *uploaded* to Cloudflare:

  * ``dist/``            -> Cloudflare Pages  (the static frontend bundle)
  * native installers    -> Cloudflare R2     (the downloadable product)

Subcommands
-----------
  check   Non-mutating readiness report: wrangler, auth, version, artifacts,
          and whether the tree currently holds Community or Pro sources.
  stage   Collect built artifacts into dist-cloudflare/<version>/ with a
          SHA256SUMS.txt and a latest.json manifest. No network access.
  pages   Build the frontend (pnpm build) and deploy dist/ to a Pages project.
  r2      Stage, then upload the installers to an R2 bucket.

Options that matter
-------------------
  --dry-run       Print every wrangler invocation without running it.
  --allow-pro     Required before any Pro Edition artifact leaves the machine.
                  Pro builds are paid, export-controlled and private; uploading
                  one to a public bucket is not recoverable, so the default is
                  to refuse. See docs/export-compliance-pro.md.

Usage
-----
  python3 scripts/deploy-cloudflare.py check
  python3 scripts/deploy-cloudflare.py stage
  python3 scripts/deploy-cloudflare.py pages --project visualtalk
  python3 scripts/deploy-cloudflare.py r2 --bucket visualtalk-releases
  python3 scripts/deploy-cloudflare.py r2 --bucket visualtalk-releases --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAURI_DIR = ROOT / "src-tauri"
TARGET_DIR = TAURI_DIR / "target"
PRODUCT_RELEASE_DIR = ROOT / "product-release"
WEB_DIST = ROOT / "dist"
STAGE_ROOT = ROOT / "dist-cloudflare"
E2EE_RS = TAURI_DIR / "src" / "e2ee.rs"

# Anything whose name matches this is a Pro Edition artifact.
PRO_NAME_RE = re.compile(r"visualtalk[\s_-]*pro", re.IGNORECASE)

# wrangler is deliberately NOT a dependency of this repo (AGENTS.md:
# dependencies are a decision). pnpm dlx resolves it on demand, pinned to v4.
WRANGLER_DLX = ["pnpm", "dlx", "wrangler@4"]

# Bundle directories Tauri writes to: `tauri build` (no --target) uses
# target/release/bundle, `pnpm mac:build` and friends use target/<triple>/...
BUNDLE_GLOBS = ("release/bundle", "*/release/bundle")

# Installer extensions worth shipping. Directories (.app) are zipped first.
ARTIFACT_SUFFIXES = (
    ".dmg",
    ".pkg",
    ".zip",
    ".exe",
    ".msi",
    ".appimage",
    ".deb",
    ".rpm",
    ".apk",
    ".aab",
    ".ipa",
)

CONTENT_TYPES = {
    ".dmg": "application/x-apple-diskimage",
    ".pkg": "application/x-apple-diskimage",
    ".zip": "application/zip",
    ".exe": "application/vnd.microsoft.portable-executable",
    ".msi": "application/x-msi",
    ".appimage": "application/vnd.appimage",
    ".deb": "application/vnd.debian.binary-package",
    ".rpm": "application/x-rpm",
    ".apk": "application/vnd.android.package-archive",
    ".aab": "application/octet-stream",
    ".ipa": "application/octet-stream",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
}

@dataclass(frozen=True)
class Artifact:
    """One uploadable file, plus the metadata its R2 object needs."""

    path: Path
    kind: str  # "installer" | "manifest"
    edition: str  # "community" | "pro"
    source: str  # where it was found, for the report

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def suffix(self) -> str:
        return self.path.suffix.lower()

    @property
    def content_type(self) -> str:
        return CONTENT_TYPES.get(self.suffix, "application/octet-stream")

    @property
    def size(self) -> int:
        return self.path.stat().st_size


# ─────────────────────────────── small helpers ───────────────────────────────


def run(
    command: list[str],
    *,
    dry_run: bool = False,
    check: bool = True,
    cwd: Path = ROOT,
    capture: bool = False,
    quiet: bool = False,
) -> subprocess.CompletedProcess | None:
    """Run a command, echoing it first.

    stdin is /dev/null on purpose: wrangler prompts interactively when it wants
    a login or a confirmation and otherwise dies with "IO error: not a
    terminal", which reads like a wrangler bug rather than a missing login.
    """
    printable = " ".join(str(part) for part in command)
    if dry_run:
        if not quiet:
            print(f"  [dry-run] {printable}")
        return None
    if not quiet:
        print(f"  $ {printable}", flush=True)
    return subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd),
        stdin=subprocess.DEVNULL,
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def wrangler(args: list[str], **kwargs) -> subprocess.CompletedProcess | None:
    return run([*WRANGLER_DLX, *args], **kwargs)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KiB", "MiB"):
        if size < 1024:
            return f"{int(size)} B" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} GiB"


def project_version() -> str:
    """Version from tauri.conf.json — the one the bundles are named after."""
    config = json.loads((TAURI_DIR / "tauri.conf.json").read_text(encoding="utf-8"))
    return str(config.get("version") or "")


def git_sha() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def installed_edition() -> str:
    """community | pro, from the same marker scripts/setup-pro.py checks."""
    try:
        text = E2EE_RS.read_text(encoding="utf-8")
    except OSError:
        return "community"
    return "pro" if "Aes256Gcm" in text else "community"


def edition_of(path: Path) -> str:
    return "pro" if PRO_NAME_RE.search(path.name) else "community"


# ──────────────────────────── artifact discovery ─────────────────────────────

# Extra places built artifacts land outside src-tauri/target/*/release/bundle.
EXTRA_ARTIFACT_GLOBS = (
    # product-release/ is where scripts/build_release.py moves bundles built on
    # another machine (e.g. the Windows installers). play/ holds store
    # screenshots — marketing assets, never installers.
    (PRODUCT_RELEASE_DIR, "*/*/*", "product-release"),
    (ROOT / "src-tauri/gen/apple/build", "arm64/*.ipa", "gen/apple"),
    (ROOT / "src-tauri/gen/android/app/build/outputs", "**/*.apk", "gen/android"),
    (ROOT / "src-tauri/gen/android/app/build/outputs", "**/*.aab", "gen/android"),
)


def bundle_dirs() -> list[Path]:
    """Every Tauri bundle directory that currently exists."""
    found: list[Path] = []
    for pattern in BUNDLE_GLOBS:
        found.extend(path for path in TARGET_DIR.glob(pattern) if path.is_dir())
    # Stable, deepest-first so per-target dirs sort next to the plain one.
    return sorted(set(found), key=lambda path: str(path))


def arch_for(bundle_dir: Path) -> str:
    """Best-effort architecture label for a bundle directory."""
    parts = bundle_dir.relative_to(TARGET_DIR).parts
    if len(parts) > 2:  # target/<triple>/release/bundle
        triple = parts[0]
        if triple.startswith("aarch64"):
            return "aarch64"
        if triple.startswith("x86_64"):
            return "x64"
        if triple.startswith("universal"):
            return "universal"
        return triple
    machine = platform.machine().lower()
    return "aarch64" if machine in ("arm64", "aarch64") else "x64"


def app_zip_name(app_dir: Path, version: str, arch: str) -> str:
    return f"{app_dir.stem}_{version}_{arch}.app.zip" if version else f"{app_dir.stem}.zip"


def zip_app_bundle(app_dir: Path, stage_dir: Path, version: str, arch: str, *, dry_run: bool) -> Path:
    """Zip a macOS .app bundle.

    R2 stores objects, not directories, and a naive `zip -r` drops the resource
    forks and symlinks that make a .app launchable. `ditto` is the macOS-native
    archiver for exactly this and is present on every machine that can build a
    .app in the first place.
    """
    destination = stage_dir / app_zip_name(app_dir, version, arch)
    if dry_run:
        print(f"  [dry-run] ditto -c -k --sequesterRsrc --keepParent {app_dir} {destination}")
        return destination
    print(f"  ⚙︎  zipping {app_dir.name} → {destination.name}")
    run(
        ["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app_dir, destination],
        cwd=ROOT,
    )
    return destination


def discover_artifacts(
    version: str,
    stage_dir: Path,
    *,
    dry_run: bool = False,
    include_debug: bool = False,
    match: list[str] | None = None,
) -> list[Artifact]:
    """Find every uploadable installer, zipping .app bundles as it goes.

    Debug builds are skipped by default: an Android debug APK is ~200 MB of
    unstripped, unsigned, unoptimised code that nobody should download, and
    R2 charges for the storage. Pass --include-debug only deliberately.
    """
    artifacts: dict[str, Artifact] = {}
    skipped: list[str] = []

    def wanted(path: Path) -> bool:
        if not include_debug and "debug" in path.name.lower():
            skipped.append(f"{path.name} (debug build)")
            return False
        if match and not any(token.lower() in path.name.lower() for token in match):
            skipped.append(f"{path.name} (no --match)")
            return False
        return True

    def add(path: Path, source: str, kind: str = "installer") -> None:
        existing = artifacts.get(path.name)
        if existing and existing.path.stat().st_mtime >= path.stat().st_mtime:
            print(f"  ⚠︎  duplicate name {path.name}: keeping the newer copy from {existing.source}")
            return
        artifacts[path.name] = Artifact(
            path=path, kind=kind, edition=edition_of(path), source=source
        )

    for bundle_dir in bundle_dirs():
        arch = arch_for(bundle_dir)
        source = str(bundle_dir.relative_to(ROOT))
        for app_dir in sorted(bundle_dir.glob("macos/*.app")):
            # Filter on the ZIP name, not the .app directory name: --match dmg
            # must not silently drop the app bundle, and --match app.zip must.
            if not wanted(stage_dir / app_zip_name(app_dir, version, arch)):
                continue
            zipped = zip_app_bundle(app_dir, stage_dir, version, arch, dry_run=dry_run)
            if zipped.exists() or dry_run:
                add(zipped, source)
        for path in sorted(bundle_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in ARTIFACT_SUFFIXES:
                continue
            if ".app/" in str(path):  # contents of an app bundle: already zipped
                continue
            if not wanted(path):
                continue
            add(path, source)

    for base, pattern, source in EXTRA_ARTIFACT_GLOBS:
        if not base.is_dir():
            continue
        for path in sorted(base.glob(pattern)):
            if path.is_file() and path.suffix.lower() in ARTIFACT_SUFFIXES and wanted(path):
                add(path, source)

    for name in skipped:
        print(f"  ⏭  skipped {name}")
    return sorted(artifacts.values(), key=lambda artifact: artifact.name)


# ────────────────────────────────── staging ──────────────────────────────────


def filter_pro(artifacts: list[Artifact], *, allow_pro: bool) -> list[Artifact]:
    """Refuse Pro artifacts unless the operator explicitly opts in."""
    pro = [artifact for artifact in artifacts if artifact.edition == "pro"]
    if not pro:
        return artifacts
    if not allow_pro:
        names = ", ".join(artifact.name for artifact in pro)
        print(
            "❌ Refusing to upload Pro Edition artifacts without --allow-pro:\n"
            f"   {names}\n"
            "   Pro builds are paid, export-controlled and their sources are\n"
            "   private. Uploading one to a public bucket cannot be undone.\n"
            "   Re-run with --allow-pro only for a private/authenticated bucket.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    print("  ⚠︎  --allow-pro: Pro Edition artifacts are included in this upload.")
    return artifacts


def stage_artifacts(args: argparse.Namespace) -> tuple[Path, list[Artifact]]:
    """Copy everything uploadable into dist-cloudflare/<version>/ + manifests."""
    version = project_version()
    stage_dir = STAGE_ROOT / version

    if not args.dry_run:
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        stage_dir.mkdir(parents=True)
    else:
        stage_dir.mkdir(parents=True, exist_ok=True)

    print(f"▶ Staging artifacts for v{version} → {stage_dir.relative_to(ROOT)}/")
    artifacts = discover_artifacts(
        version,
        stage_dir,
        dry_run=args.dry_run,
        include_debug=args.include_debug,
        match=args.match,
    )
    artifacts = filter_pro(artifacts, allow_pro=args.allow_pro)

    if not artifacts:
        print(
            "❌ No installers found. Build one first, e.g.:\n"
            "     pnpm desktop:build            # macOS .app + .dmg (Community)\n"
            "     pnpm mac:build:intel          # Intel mac\n"
            "     pnpm win:build / linux:build  # on the matching OS",
            file=sys.stderr,
        )
        raise SystemExit(1)

    # Copy anything that is not already in the stage directory (the .app zips
    # were written there directly).
    staged: list[Artifact] = []
    for artifact in artifacts:
        destination = stage_dir / artifact.name
        if artifact.path != destination and not args.dry_run:
            shutil.copy2(artifact.path, destination)
        if args.dry_run and artifact.path != destination:
            print(f"  [dry-run] copy {artifact.path} → {destination}")
        staged.append(
            Artifact(
                path=destination,
                kind=artifact.kind,
                edition=artifact.edition,
                source=artifact.source,
            )
        )

    for artifact in staged:
        if not artifact.path.exists() and not args.dry_run:
            continue
        note = "" if artifact.path.exists() else "  (dry-run: not written)"
        size = human_size(artifact.size) if artifact.path.exists() else "—"
        print(f"  ✓ {artifact.name}  ({size}, {artifact.edition}){note}")
        if not artifact.path.exists():
            continue
        # product-release/ keeps installers built on other machines, so a
        # stale 3.3.33 .exe next to a fresh 3.3.42 .dmg is easy to miss.
        other = re.search(r"\d+\.\d+\.\d+", artifact.name)
        if other and other.group(0) != version:
            print(f"     ⚠︎  built from v{other.group(0)}, not v{version} — publish anyway?")

    if not args.dry_run:
        write_manifests(stage_dir, staged, version)
    else:
        # Keep the dry-run honest: show the two generated manifests as uploads
        # too, without writing them.
        for extra in (stage_dir / "SHA256SUMS.txt", stage_dir / "latest.json"):
            print(f"  [dry-run] generate {extra.name}")
            staged.append(
                Artifact(path=extra, kind="manifest", edition="community", source="generated")
            )
    return stage_dir, staged


def write_manifests(stage_dir: Path, artifacts: list[Artifact], version: str) -> None:
    """SHA256SUMS.txt (shasum -c compatible) + latest.json (machine readable)."""
    sums = stage_dir / "SHA256SUMS.txt"
    lines = [f"{sha256_of(artifact.path)}  {artifact.name}" for artifact in artifacts]
    sums.write_text("\n".join(lines) + "\n", encoding="utf-8")

    manifest = stage_dir / "latest.json"
    manifest.write_text(
        json.dumps(
            {
                "product": "VisualTalk",
                "version": version,
                "gitSha": git_sha(),
                "edition": "pro" if any(a.edition == "pro" for a in artifacts) else "community",
                "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "artifacts": [
                    {
                        "name": artifact.name,
                        "edition": artifact.edition,
                        "size": artifact.size,
                        "sha256": sha256_of(artifact.path),
                        "contentType": artifact.content_type,
                        "builtFrom": artifact.source,
                    }
                    for artifact in artifacts
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    for extra in (sums, manifest):
        artifacts.append(Artifact(path=extra, kind="manifest", edition="community", source="generated"))
    print(f"  ✓ {sums.name}, {manifest.name}")


# ──────────────────────────────── cloudflare ─────────────────────────────────


def ensure_wrangler_auth(*, dry_run: bool) -> None:
    """Fail early with the login command instead of a wrangler stack trace.

    A dry run only warns: you should be able to preview the exact command line
    before you have logged in.
    """
    result = wrangler(["whoami"], capture=True, check=False, quiet=True)
    if result is None:
        return
    output = f"{result.stdout}\n{result.stderr}"
    if result.returncode == 0 and "not authenticated" not in output.lower():
        return
    message = (
        "wrangler is not authenticated. Log in once, then re-run:\n"
        "     pnpm dlx wrangler@4 login\n"
        "   (CI: export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID instead.)"
    )
    if dry_run:
        print(f"  ⚠︎  {message.splitlines()[0]} (continuing: --dry-run)")
        return
    print(f"❌ {message}", file=sys.stderr)
    raise SystemExit(1)


def cmd_pages(args: argparse.Namespace) -> int:
    """Deploy the static frontend bundle (dist/) to Cloudflare Pages."""
    print(f"▶ Cloudflare Pages → project '{args.project}' (branch {args.branch})")
    print(
        "  ⚠︎  This publishes the UI shell only. In a browser every Tauri `invoke`\n"
        "     fails (no Rust core), so it is a preview, not a working web client."
    )

    if not args.skip_build:
        run(["pnpm", "build"], dry_run=args.dry_run)
    if not args.dry_run and not (WEB_DIST / "index.html").is_file():
        print(f"❌ {WEB_DIST}/index.html missing — did `pnpm build` run?", file=sys.stderr)
        return 1

    ensure_wrangler_auth(dry_run=args.dry_run)

    if args.create_project:
        wrangler(
            ["pages", "project", "create", args.project, "--production-branch", args.branch],
            dry_run=args.dry_run,
            check=False,  # already-exists is fine
        )

    wrangler(
        [
            "pages",
            "deploy",
            str(WEB_DIST),
            "--project-name",
            args.project,
            "--branch",
            args.branch,
            "--commit-hash",
            git_sha(),
            # Pages refuses to deploy from a dirty git checkout; this helper is
            # run by hand mid-session, so the check is noise here.
            "--commit-dirty",
        ],
        dry_run=args.dry_run,
    )
    print(
        f"{'[dry-run] would deploy' if args.dry_run else '✓ Deployed'} "
        f"{WEB_DIST.relative_to(ROOT)}/ to the Pages project '{args.project}'."
    )
    return 0


def object_key(args: argparse.Namespace, version: str, name: str, *, latest: bool = False) -> str:
    prefix = args.prefix.strip("/")
    parts = [part for part in (prefix, "latest" if latest else version, name) if part]
    return "/".join(parts)


def cmd_r2(args: argparse.Namespace) -> int:
    """Stage the built installers and upload them to an R2 bucket."""
    bucket = args.bucket or os.environ.get("CF_R2_BUCKET", "")
    if not bucket:
        print(
            "❌ No bucket. Pass --bucket <name> or export CF_R2_BUCKET.\n"
            "   Create one first:  pnpm dlx wrangler@4 r2 bucket create <name> --location weur",
            file=sys.stderr,
        )
        return 1

    stage_dir, artifacts = stage_artifacts(args)
    version = project_version()
    print(f"▶ Cloudflare R2 → r2://{bucket}/{args.prefix.strip('/')}/{version}/")
    if not args.dry_run:
        ensure_wrangler_auth(dry_run=args.dry_run)

    if args.create_bucket:
        wrangler(
            ["r2", "bucket", "create", bucket, "--location", args.location],
            dry_run=args.dry_run,
            check=False,  # already-exists is fine
        )

    for artifact in artifacts:
        key = object_key(args, version, artifact.name)
        command = [
            "r2",
            "object",
            "put",
            f"{bucket}/{key}",
            "--file",
            str(artifact.path),
            "--remote",
            "--content-type",
            artifact.content_type,
        ]
        if artifact.kind == "installer":
            # Versioned keys never change, so they can be cached forever; the
            # attachment disposition makes browsers download instead of opening.
            command += [
                "--content-disposition",
                f'attachment; filename="{artifact.name}"',
                "--cache-control",
                "public, max-age=31536000, immutable",
            ]
        else:
            command += ["--cache-control", "public, max-age=300"]
        wrangler(command, dry_run=args.dry_run)

        # latest.json also goes to a version-less key so a download page can
        # fetch it without knowing the current version.
        if artifact.name == "latest.json":
            wrangler(
                [
                    "r2",
                    "object",
                    "put",
                    f"{bucket}/{object_key(args, version, artifact.name, latest=True)}",
                    "--file",
                    str(artifact.path),
                    "--remote",
                    "--content-type",
                    artifact.content_type,
                    "--cache-control",
                    "public, max-age=300",
                ],
                dry_run=args.dry_run,
            )

    print(
        f"{'[dry-run] would upload' if args.dry_run else '✓ Uploaded'} "
        f"{len(artifacts)} object(s) to r2://{bucket}."
    )
    print("  Public URLs: enable the r2.dev development URL or a custom domain on")
    print("  the bucket (Cloudflare dashboard → R2 → your bucket → Settings).")
    print(f"  Staged copy kept in {stage_dir.relative_to(ROOT)}/")
    return 0


# ─────────────────────────────────── check ───────────────────────────────────


def tool_version(command: list[str]) -> str:
    result = subprocess.run(
        command,
        cwd=str(ROOT),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return "unavailable"
    return (result.stdout or result.stderr).strip().splitlines()[-1][:60]


def summarize_dist() -> str:
    if not (WEB_DIST / "index.html").is_file():
        return "MISSING → run `pnpm build`"
    files = [path for path in WEB_DIST.rglob("*") if path.is_file()]
    total = sum(path.stat().st_size for path in files)
    return f"{WEB_DIST.relative_to(ROOT)}/ ({len(files)} files, {human_size(total)})"


def summarize_artifacts() -> None:
    def flags(path: Path) -> str:
        bits = []
        if edition_of(path) == "pro":
            bits.append("PRO")
        if "debug" in path.name.lower():
            bits.append("debug → skipped by default")
        return f"  [{', '.join(bits)}]" if bits else ""

    dirs = bundle_dirs()
    if not dirs:
        print("     (no src-tauri/target/*/release/bundle — build one first)")
    for bundle_dir in dirs:
        print(f"     {bundle_dir.relative_to(ROOT)}")
        for app_dir in sorted(bundle_dir.glob("macos/*.app")):
            print(f"       • {app_dir.name}  (.app directory → zipped when staged){flags(app_dir)}")
        for path in sorted(bundle_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in ARTIFACT_SUFFIXES:
                continue
            if ".app/" in str(path):
                continue
            print(f"       • {path.name}  ({human_size(path.stat().st_size)}){flags(path)}")
    for base, pattern, source in EXTRA_ARTIFACT_GLOBS:
        if not base.is_dir():
            continue
        for path in sorted(base.glob(pattern)):
            if path.is_file() and path.suffix.lower() in ARTIFACT_SUFFIXES:
                print(f"     {source}/{path.name}  ({human_size(path.stat().st_size)}){flags(path)}")


def cmd_check(args: argparse.Namespace) -> int:
    """Non-mutating readiness report. Nothing is built, nothing is uploaded."""
    version = project_version()
    edition = installed_edition()
    print("VisualTalk → Cloudflare readiness")
    print(f"  version            {version}")
    print(f"  git sha            {git_sha()}")
    print(f"  host               {platform.system()} {platform.machine()}")
    print(f"  installed sources  {'Pro (E2EE)' if edition == 'pro' else 'Community stub'} — src-tauri/src/e2ee.rs")
    if edition == "pro":
        print("                     ⚠︎  artifacts built now are Pro: uploads need --allow-pro.")
        print("                        Run `python3 scripts/setup-pro.py --revert` when done.")
    print(f"  cargo              {shutil.which('cargo') or 'NOT FOUND'}")
    print("                     ^ present locally; ABSENT in Cloudflare's build image.")
    print(f"  pnpm               {tool_version(['pnpm', '--version'])}")
    print(f"  wrangler           {tool_version([*WRANGLER_DLX, '--version'])}")
    auth = wrangler(["whoami"], capture=True, check=False, quiet=True)
    authed = (
        bool(auth)
        and auth.returncode == 0
        and "not authenticated" not in f"{auth.stdout}{auth.stderr}".lower()
    )
    print(f"  cloudflare auth    {'authenticated' if authed else 'NOT logged in → pnpm dlx wrangler@4 login'}")
    print(f"  web bundle         {summarize_dist()}")
    print("  installers found:")
    summarize_artifacts()
    return 0


# ──────────────────────────────────── cli ────────────────────────────────────


def cmd_stage(args: argparse.Namespace) -> int:
    stage_dir, artifacts = stage_artifacts(args)
    print(f"✓ Staged {len(artifacts)} file(s) in {stage_dir.relative_to(ROOT)}/")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build locally, upload to Cloudflare (Pages for dist/, R2 for installers).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python3 scripts/deploy-cloudflare.py check\n"
            "  python3 scripts/deploy-cloudflare.py stage\n"
            "  python3 scripts/deploy-cloudflare.py pages --project visualtalk\n"
            "  python3 scripts/deploy-cloudflare.py r2 --bucket visualtalk-releases --dry-run\n"
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def common(sub_parser: argparse.ArgumentParser) -> None:
        sub_parser.add_argument("--dry-run", action="store_true", help="print commands, change nothing")
        sub_parser.add_argument(
            "--allow-pro",
            action="store_true",
            help="permit Pro Edition artifacts (refused by default)",
        )
        sub_parser.add_argument(
            "--include-debug",
            action="store_true",
            help="also stage/upload debug builds (skipped by default — they are huge)",
        )
        sub_parser.add_argument(
            "--match",
            action="append",
            metavar="SUBSTRING",
            help="only artifacts whose filename contains SUBSTRING (repeatable)",
        )

    check = sub.add_parser("check", help="readiness report (non-mutating)")
    common(check)
    check.set_defaults(handler=cmd_check)

    stage = sub.add_parser("stage", help="collect artifacts into dist-cloudflare/")
    common(stage)
    stage.set_defaults(handler=cmd_stage)

    pages = sub.add_parser("pages", help="deploy dist/ to Cloudflare Pages")
    common(pages)
    pages.add_argument("--project", default=os.environ.get("CF_PAGES_PROJECT", "visualtalk"))
    pages.add_argument("--branch", default="main", help="Pages branch (default: main)")
    pages.add_argument("--create-project", action="store_true", help="create the Pages project if missing")
    pages.add_argument("--skip-build", action="store_true", help="deploy the existing dist/ as-is")
    pages.set_defaults(handler=cmd_pages)

    r2 = sub.add_parser("r2", help="stage installers and upload them to R2")
    common(r2)
    r2.add_argument("--bucket", default=os.environ.get("CF_R2_BUCKET", ""), help="R2 bucket name")
    r2.add_argument("--prefix", default="releases", help="key prefix in the bucket (default: releases)")
    r2.add_argument("--create-bucket", action="store_true", help="create the bucket if missing")
    r2.add_argument(
        "--location",
        default="weur",
        choices=["weur", "eeur", "apac", "wnam", "enam", "oc"],
        help="location hint when creating a bucket (default: weur = Western Europe)",
    )
    r2.set_defaults(handler=cmd_r2)

    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.handler(args) or 0)
    except subprocess.CalledProcessError as error:
        print(f"❌ command failed ({error.returncode}): {' '.join(map(str, error.cmd))}", file=sys.stderr)
        if error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        return error.returncode or 1
    except FileNotFoundError as error:
        print(f"❌ missing executable: {error}", file=sys.stderr)
        return 127
    except KeyboardInterrupt:
        print("\n⚠︎  interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))






