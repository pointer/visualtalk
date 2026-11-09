#!/usr/bin/env python3
"""Render site/downloads/index.html from a GitHub Release's assets.

Why this exists
---------------
The desktop installers are published as GitHub Release assets (release.yml on a
`v*` tag). A hand-written download page drifts the moment a release is rebuilt,
so this script regenerates the page from the release itself: asset names, sizes
and SHA-256 sums are computed by downloading each asset, never typed.

Usage
-----
    python3 scripts/build-downloads-page.py --tag v3.3.43

Requires the `gh` CLI, authenticated, because release assets are fetched through
the API. Writes <out> (default site/downloads/index.html) plus a sibling
SHA256SUMS.txt. Exits non-zero when the release has no assets yet (CI still
running) so it cannot publish an empty page.

The page states signing status explicitly and does not guess: pass
--macos-signing notarized|ad-hoc and --windows-signing unsigned|signed so the
warnings match reality. Defaults are the honest pessimistic ones.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PLATFORM_HINTS = (
    ("macOS (Apple Silicon)", lambda n: n.endswith(".dmg") and "aarch64" in n),
    ("macOS (Intel)", lambda n: n.endswith(".dmg") and ("x64" in n or "x86" in n)),
    ("Windows (x64)", lambda n: n.endswith(".msi") or n.endswith(".exe")),
    ("Linux (x64)", lambda n: n.endswith((".AppImage", ".deb", ".rpm"))),
    ("Self-hosted server stack", lambda n: n.startswith("visualtalk-server-") and n.endswith(".zip")),
)


def release_assets(tag: str) -> list[dict]:
    out = subprocess.run(
        ["gh", "release", "view", tag, "--json", "assets,tagName,url"],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    assets = []
    for a in data.get("assets", []):
        digest = (a.get("digest") or "")
        assets.append({
            "name": a["name"],
            "url": a["url"],
            "size": a["size"],
            # GitHub supplies sha256:<hex> per asset; use it instead of
            # re-downloading tens of MB when present.
            "sha256": digest.removeprefix("sha256:") if digest.startswith("sha256:") else "",
        })
    return assets


def sha256_of_url(url: str) -> str:
    # GitHub API asset URLs redirect to the CDN; urllib follows them.
    digest = hashlib.sha256()
    with urllib.request.urlopen(url) as resp:  # release assets only
        for chunk in iter(lambda: resp.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def human(num: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB"):
        if num < 1024:
            return f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} TiB"


SIGNING_NOTES = {
    ("notarized", "unsigned"):
        "macOS builds are notarized and stapled, so Gatekeeper opens them normally. "
        "Windows builds are <strong>not code-signed</strong>: SmartScreen will warn "
        "&ldquo;unknown publisher&rdquo;. Verify the SHA-256 below, then choose "
        "&ldquo;More info &rarr; Run anyway&rdquo;.",
    ("ad-hoc", "unsigned"):
        "<strong>Neither build is notarized nor code-signed yet.</strong> macOS will "
        "refuse to open the app until you right-click &rarr; Open; Windows SmartScreen "
        "will warn &ldquo;unknown publisher&rdquo;. Always verify the SHA-256 of what "
        "you download against this page.",
}


def render(assets: list[dict], tag: str, macos_signing: str, windows_signing: str) -> str:
    rows = []
    for label, match in PLATFORM_HINTS:
        for a in assets:
            if match(a["name"]):
                rows.append(
                    f"    <tr><td>{label}</td><td><a href=\"{a['url']}\">{a['name']}</a></td>"
                    f"<td>{human(a['size'])}</td><td><code>{a['sha256'][:16]}&hellip;</code></td></tr>"
                )
    note = SIGNING_NOTES.get(
        (macos_signing, windows_signing),
        f"Signing status: macOS={macos_signing}, windows={windows_signing}.",
    )
    sums = "\n".join(f"{a['sha256']}  {a['name']}" for a in assets)
    version = tag.lstrip("v")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download VisualTalk {version}</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ margin: 0; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         color: #1c1c1e; background: #fafafa; }}
  @media (prefers-color-scheme: dark) {{ body {{ color: #f2f2f7; background: #101014; }} a {{ color: #c4a5ff; }} }}
  body > * {{ max-width: 52rem; margin-left: auto; margin-right: auto; padding-left: 1.25rem; padding-right: 1.25rem; }}
  header.site {{ padding-top: 1.5rem; padding-bottom: .75rem; border-bottom: 1px solid #d1d1d6; margin-bottom: 2rem; }}
  @media (prefers-color-scheme: dark) {{ header.site {{ border-color: #3a3a3c; }} }}
  h1 {{ font-size: 2rem; letter-spacing: -.02em; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1.5rem 0; }}
  td, th {{ border: 1px solid #d1d1d6; padding: .5rem .7rem; text-align: left; vertical-align: top; }}
  @media (prefers-color-scheme: dark) {{ td, th {{ border-color: #3a3a3c; }} }}
  code {{ font-size: .85em; }}
  .warn {{ border-left: 4px solid #ec4899; padding: .75rem 1rem; background: rgba(236,72,153,.08); }}
  a {{ color: #7c3aed; }}
  pre {{ overflow-x: auto; font-size: .8rem; }}
</style>
</head>
<body>
<header class="site"><strong>VisualTalk</strong> &middot; <a href="/">Home</a> &middot; <a href="/privacy">Privacy</a></header>
<main>
  <h1>Download VisualTalk {version}</h1>
  <p>Community Edition. Bring your own LiveKit server; recordings stay on your
     device. By downloading you agree to the <a href="/privacy">privacy policy</a>
     and the EULA shown at first launch.</p>
  <p class="warn">{note}</p>
  <table>
    <tr><th>Platform</th><th>Installer</th><th>Size</th><th>SHA-256 (first 16)</th></tr>
{chr(10).join(rows)}
  </table>
  <h2>Verify your download</h2>
  <pre>shasum -a 256 &lt;file&gt;             # macOS / Linux
certutil -hashfile &lt;file&gt; SHA256   # Windows</pre>
  <p>Full checksums: <a href="SHA256SUMS.txt">SHA256SUMS.txt</a>.</p>
</main>
</body>
</html>
<!-- sums
{sums}
-->
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--out", default=str(ROOT / "site" / "downloads" / "index.html"))
    ap.add_argument("--macos-signing", choices=["notarized", "ad-hoc"], default="ad-hoc")
    ap.add_argument("--windows-signing", choices=["signed", "unsigned"], default="unsigned")
    args = ap.parse_args()

    assets = release_assets(args.tag)
    if not assets:
        print(f"❌ release {args.tag} has no assets yet (CI still running?)", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"▶ collecting hashes for {len(assets)} release assets…")
    for a in assets:
        if not a["sha256"]:
            a["sha256"] = sha256_of_url(a["url"])
        print(f"   {a['sha256'][:12]}…  {a['name']}")

    html = render(assets, args.tag, args.macos_signing, args.windows_signing)
    sums = html.split("<!-- sums\n", 1)[1].split("\n-->", 1)[0]
    out.write_text(html, encoding="utf-8")
    (out.parent / "SHA256SUMS.txt").write_text(sums + "\n", encoding="utf-8")
    print(f"✓ wrote {out} and SHA256SUMS.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())

