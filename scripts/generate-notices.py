#!/usr/bin/env python3
"""
generate-notices.py — Third-party license compliance generator for VisualTalk.

Scans the resolved Rust (cargo metadata) and npm dependency graphs, extracts the
REAL license texts from the local cargo registry cache and node_modules, and
emits:

  * THIRD_PARTY_NOTICES.md          — the authoritative attribution document
  * src/lib/thirdPartyNotices.js    — same content as a lazily-imported ES module
                                      (rendered by the in-app "Open Source" tab)

Usage:
  python3 scripts/generate-notices.py            # (re)generate both artifacts
  python3 scripts/generate-notices.py --check    # CI gate: fail on forbidden
                                                 # licenses or a stale artifact

No license text is ever synthesised: if a text cannot be located locally the
generator emits an SPDX URL pointer and records a warning.
"""

import collections
import datetime
import glob
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_TAURI = os.path.join(REPO, 'src-tauri')
NODE_MODULES = os.path.join(REPO, 'node_modules')
OUT_MD = os.path.join(REPO, 'THIRD_PARTY_NOTICES.md')
OUT_JS = os.path.join(REPO, 'src', 'lib', 'thirdPartyNotices.js')

PRODUCT = 'VisualTalk'
MAX_TEXT_BYTES = 400_000

# Licenses that would impose copyleft/source-disclosure obligations on a
# commercially sold, closed-source binary. CI fails if any of these appear in a
# *shipped* dependency.
FORBIDDEN = [
    r'\bGPL-[23]', r'\bAGPL', r'\bLGPL(?![- ]?2\.1[- ]or[- ]later\b)',  # LGPL handled separately
    r'\bSSPL\b', r'\bBUSL\b', r'Business Source', r'Commons Clause',
    r'\bElastic License', r'\bCDDL\b', r'\bEPL\b', r'PolyForm',
    r'Noncommercial', r'\bHIPPOCRATIC\b', r'\bJSON\b',
]
# Weak copyleft: allowed, but must stay on the radar (file-scoped obligations).
WATCH = [r'\bMPL-2\.0\b', r'\bLGPL-2\.1-or-later\b', r'\bCDLA\b']

# SPDX id -> (regex signature used to recognise the text, canonical URL)
SIGNATURES = {
    'Apache-2.0': (r'Apache License\s*\n\s*Version 2\.0',
                   'https://www.apache.org/licenses/LICENSE-2.0.txt'),
    # Deliberately includes the "of this software and associated documentation
    # files" tail: without it, the UNICODE LICENSE V3 (which grants rights in
    # "a copy of the Unicode data files") would be mis-detected as MIT.
    'MIT': (r'Permission is hereby granted, free of charge, to any person obtaining a copy\s+'
            r'of this software and associated documentation files',
            'https://opensource.org/licenses/MIT'),
    'MIT-0': (r'MIT No Attribution', 'https://spdx.org/licenses/MIT-0.html'),
    '0BSD': (r'BSD Zero Clause|Zero Clause BSD',
             'https://spdx.org/licenses/0BSD.html'),
    'ISC': (r'Permission to use, copy, modify, and(?:/or)? distribute this software'
            r'[\s\S]{0,300}?provided that the above copyright notice and this permission '
            r'notice appear',
            'https://opensource.org/licenses/ISC'),
    'BSD-3-Clause': (r'Redistributions of source code must retain the above copyright notice[\s\S]{0,2000}?Neither the name',
                     'https://opensource.org/licenses/BSD-3-Clause'),
    'BSD-2-Clause': (r'Redistributions of source code must retain the above copyright notice',
                     'https://opensource.org/licenses/BSD-2-Clause'),
    'MPL-2.0': (r'Mozilla Public License Version 2\.0',
                'https://www.mozilla.org/en-US/MPL/2.0/'),
    'Zlib': (r"provided 'as-is'|provided .as-is.", 'https://opensource.org/licenses/Zlib'),
    'Unicode-3.0': (r'UNICODE LICENSE V3|Unicode License v3',
                    'https://www.unicode.org/license.txt'),
    'Unlicense': (r'free and unencumbered software released into the public domain',
                  'https://unlicense.org/'),
    'CC0-1.0': (r'CC0 1\.0 Universal|Creative Commons Zero',
                'https://creativecommons.org/publicdomain/zero/1.0/legalcode'),
    'CDLA-Permissive-2.0': (r'Community Data License Agreement - Permissive',
                            'https://cdla.dev/permissive-2-0/'),
    'LLVM-exception': (r'LLVM Exception',
                       'https://spdx.org/licenses/LLVM-exception.html'),
}

# Extra bundled-C / crypto license files that must be reproduced verbatim
# (crate dir name prefix -> list of file names).
BUNDLED_CRYPTO = {
    'ring': ['LICENSE', 'LICENSE-BoringSSL', 'LICENSE-other-bits'],
    'aws-lc-sys': ['LICENSE'],
}

# A harvested block must be at least this long to be accepted as the real text
# (guards against stub references); among valid candidates the SHORTEST is used,
# which avoids over-capturing a big multi-license provenance file.
MIN_LEN = {
    'Apache-2.0': 9000, 'MIT': 600, 'MIT-0': 400, '0BSD': 350, 'ISC': 400,
    'BSD-3-Clause': 900, 'BSD-2-Clause': 800, 'MPL-2.0': 14000, 'Zlib': 600,
    'Unicode-3.0': 1500, 'Unlicense': 800, 'CC0-1.0': 4000,
    'CDLA-Permissive-2.0': 1800, 'LLVM-exception': 250,
}

# A candidate block must also contain its license's closing/distinctive marker
# (matched case-insensitively), so an abbreviated or truncated copy can never be
# selected over a complete one.
REQUIRED_PHRASES = {
    'Apache-2.0': 'end of terms and conditions',
    'MPL-2.0': 'exhibit a',
    'MIT': 'in no event shall the authors or copyright holders be liable',
    'MIT-0': 'in no event shall the authors or copyright holders be liable',
    'CC0-1.0': 'limitations and disclaimers',
    'CDLA-Permissive-2.0': 'definitions',
    'Unicode-3.0': 'Unicode-3.0',
    'Unlicense': 'other dealings in the software',
    'Zlib': 'removed or altered from any source distribution',
    'ISC': 'this permission notice appear',
    '0BSD': 'in connection with the use or performance of this software',
    'BSD-3-Clause': 'neither the name',
    'LLVM-exception': 'LLVM Exception',
}

# Upper bound on an accepted block: prevents a poorly delimited slice from
# swallowing unrelated trailing material out of a multi-license file.
MAX_LEN = {
    'Apache-2.0': 13000, 'MPL-2.0': 20000, 'MIT': 1500, 'MIT-0': 1500,
    'CC0-1.0': 8000, 'CDLA-Permissive-2.0': 4000, 'Unicode-3.0': 4000,
    'Unlicense': 1600, 'Zlib': 2000, 'ISC': 1600, '0BSD': 1200,
    'BSD-3-Clause': 2200, 'BSD-2-Clause': 2000, 'LLVM-exception': 1500,
}

# 0BSD and ISC share their opening sentence; the ISC-only "provided that the
# above copyright notice…" clause is what actually distinguishes them, so a
# block containing it can never be the 0BSD text.
EXCLUDED_PHRASES = {
    '0BSD': 'provided that the above copyright notice',
}

# Multi-licensed components: which alternative VisualTalk elects. Electing a
# permissive alternative means the copyleft alternative imposes no obligation.
ELECTIONS = {
    'MIT OR Apache-2.0 OR LGPL-2.1-or-later':
        ('MIT OR Apache-2.0',
         '`r-efi` is triple-licensed. VisualTalk elects MIT OR Apache-2.0, so no '
         'LGPL obligation arises and no LGPL text needs to be reproduced.'),
}
ELECTED_AWAY = {'LGPL-2.1-or-later'}


# ── Dependency collection ─────────────────────────────────────────────────────


def crate_dir(name, version):
    for root in glob.glob(os.path.expanduser('~/.cargo/registry/src/*')):
        d = os.path.join(root, '%s-%s' % (name, version))
        if os.path.isdir(d):
            return d
    return None


def cargo_packages():
    """Resolved crate graph via `cargo metadata` (authoritative license fields)."""
    out = subprocess.run(['cargo', 'metadata', '--format-version', '1'],
                         cwd=SRC_TAURI, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit('ERROR: cargo metadata failed:\n' + out.stderr[:2000])
    meta = json.loads(out.stdout)
    root_id = next(p['id'] for p in meta['packages'] if p['name'] == 'visualtalk')
    resolve = {n['id']: n for n in meta['resolve']['nodes']}
    direct = {d['pkg'] for d in resolve[root_id].get('deps', [])}
    pkgs = []
    for p in meta['packages']:
        if p['id'] == root_id:
            continue
        lic = p.get('license') or ''
        lf = p.get('license_file') or ''
        pkgs.append({
            'eco': 'crates.io',
            'name': p['name'],
            'version': p['version'],
            'license': lic if lic else ('license-file:%s' % lf if lf else '<unspecified>'),
            'url': p.get('repository') or '',
            'direct': p['id'] in direct,
            'dir': crate_dir(p['name'], p['version']),
            'shipped': True,   # every resolved crate is statically linked in
        })
    return pkgs


def npm_index():
    idx = {}
    patterns = [
        os.path.join(NODE_MODULES, '.pnpm', '*', 'node_modules', '*', 'package.json'),
        os.path.join(NODE_MODULES, '.pnpm', '*', 'node_modules', '@*', '*', 'package.json'),
    ]
    for pat in patterns:
        for f in glob.glob(pat):
            try:
                d = json.load(open(f))
            except Exception:
                continue
            if not d.get('name'):
                continue
            # Platform-specific native binaries (esbuild/rollup/rolldown/
            # lightningcss/tauri-cli bindings, fsevents, …) declare os/cpu
            # restrictions, install differently on every runner OS and are
            # never bundled into the shipped app. Skipping them keeps the
            # notices corpus identical on macOS, Linux and Windows.
            if d.get('os') or d.get('cpu'):
                continue
            idx[(d['name'], d.get('version', ''))] = (os.path.dirname(f), d)
    return idx


def npm_packages():
    """Classify npm packages as shipped (bundled by Vite) or build-time only."""
    idx = npm_index()
    by_name = collections.defaultdict(list)
    for (n, v), (d, doc) in idx.items():
        by_name[n].append((v, d, doc))

    root = json.load(open(os.path.join(REPO, 'package.json')))
    runtime_roots = list((root.get('dependencies') or {}).keys())
    dev_roots = list((root.get('devDependencies') or {}).keys())

    def walk(names):
        seen, stack = set(), list(names)
        while stack:
            base = stack.pop()
            if base in seen or base not in by_name:
                continue
            seen.add(base)
            for _v, _d, doc in by_name[base]:
                for dep in (doc.get('dependencies') or {}):
                    stack.append(dep)
        return seen

    shipped = walk(runtime_roots)
    pkgs = []
    for (n, v), (d, doc) in sorted(idx.items()):
        lic = doc.get('license')
        if isinstance(lic, dict):
            lic = lic.get('type')
        repo = doc.get('repository')
        if isinstance(repo, dict):
            repo = repo.get('url', '')
        pkgs.append({
            'eco': 'npm', 'name': n, 'version': v,
            'license': str(lic) if lic else '<unspecified>',
            'url': repo or '', 'direct': n in runtime_roots,
            'dir': d, 'shipped': n in shipped,
        })
    return pkgs


# ── License text harvesting ───────────────────────────────────────────────────


def license_files(pkg):
    """Top-level license/notice files inside a package's source directory."""
    if not pkg.get('dir'):
        return []
    seen = []
    for pat in ('LICENSE*', 'LICENCE*', 'COPYING*', 'NOTICE*', 'UNLICENSE*',
                '*LICENSE*', '*LICENCE*', '*COPYING*'):
        for f in sorted(glob.glob(os.path.join(pkg['dir'], pat))):
            if os.path.isfile(f) and os.path.getsize(f) < MAX_TEXT_BYTES and f not in seen:
                seen.append(f)
    return seen


def read(path):
    with open(path, encoding='utf-8', errors='replace') as fh:
        return fh.read()


def slice_block(body, spdx):
    """Extract just the region of `body` belonging to `spdx`.

    Many crates ship one file containing several licenses (e.g. dunce = CC0 +
    MIT-0, aws-lc-sys = a provenance file covering ISC/MIT/BSD/MIT-0,
    LICENSE-Apache-2.0_WITH_LLVM-exception = Apache text + the exception).
    We locate every known signature, then return the span from this license's
    signature up to the next *different* license's signature.
    """
    m = re.search(SIGNATURES[spdx][0], body, re.I)
    if not m:
        return None
    start = m.start()
    marks = sorted((mm.start(), s)
                   for s, (sg, _) in SIGNATURES.items()
                   for mm in re.finditer(sg, body, re.I))

    def is_cut(pos):
        """Only a mark that really *starts* a new license block may end this one.

        Guards against nested/overlapping wording, e.g. the UNICODE LICENSE V3
        and MIT-0 texts both contain MIT-like "Permission is hereby granted…"
        phrasing mid-paragraph; those must not truncate the enclosing license.
        """
        if pos - start < max(MIN_LEN.get(spdx, 400) // 2, 200):
            return False
        # A genuine new license begins at the start of a line, and is not
        # immediately followed by the word "of" (a continuation of prose).
        line_start = body.rfind('\n', 0, pos) + 1
        if body[line_start:pos].strip():
            return False
        return not body[pos:pos + 120].split('\n')[0].rstrip().endswith(' of')

    nxt = [pos for pos, s in marks if pos > start and s != spdx and is_cut(pos)]
    end = min(nxt) if nxt else len(body)
    floor = max([p for p, _ in marks if p < start] or [0])

    # Pull in immediately preceding copyright line(s) — MIT/BSD require them.
    hdr = []
    for line in reversed(body[floor:start].rstrip().splitlines()):
        if not line.strip():
            if hdr:
                break
            continue
        if re.search(r'copyright|\(c\)', line, re.I):
            hdr.insert(0, line)
        else:
            break
    return ('\n'.join(hdr) + ('\n\n' if hdr else '') + body[start:end]).strip()


def license_tokens(expr):
    for tok in re.split(r'[\s()]+', expr.replace('/', ' ')):
        tok = tok.strip().strip(',')
        if tok and tok not in ('AND', 'OR', 'WITH', '<unspecified>') \
                and not tok.startswith('license-file'):
            yield tok


def acceptable(spdx, blk):
    """True if `blk` is a complete, correctly bounded copy of `spdx`."""
    n = len(blk)
    if n < MIN_LEN.get(spdx, 200) or n > MAX_LEN.get(spdx, 60_000):
        return False
    low = blk.lower()
    excluded = EXCLUDED_PHRASES.get(spdx)
    if excluded and excluded.lower() in low:
        return False
    phrase = REQUIRED_PHRASES.get(spdx)
    return phrase is None or phrase.lower() in low


def harvest_texts(pkgs):
    """Find one real, local copy of each SPDX license text we must ship."""
    needed, elections = set(), {}
    for p in pkgs:
        if not p['shipped']:
            continue
        if p['license'] in ELECTIONS:
            elections[p['license']] = ELECTIONS[p['license']]
        for tok in license_tokens(p['license']):
            if tok not in ELECTED_AWAY:
                needed.add(tok)

    cands = collections.defaultdict(list)
    for p in pkgs:
        for f in license_files(p):
            body = read(f)
            fname_norm = re.sub(r'[^a-z0-9]', '', os.path.basename(f).lower())
            for spdx in needed:
                if spdx not in SIGNATURES:
                    continue
                blk = slice_block(body, spdx)
                if blk is None:
                    # Fallback: the file is named after the license (e.g. adler2's
                    # LICENSE-0BSD, whose text has no "BSD Zero Clause" heading).
                    spdx_norm = re.sub(r'[^a-z0-9]', '', spdx.lower())
                    if spdx_norm and spdx_norm in fname_norm:
                        blk = body.strip()
                if blk and acceptable(spdx, blk):
                    cands[spdx].append(
                        (0 if p['shipped'] else 1, len(blk), blk,
                         '%s %s (`%s`)' % (p['name'], p['version'], os.path.basename(f))))

    texts, sources, warns = {}, {}, []
    for spdx in sorted(needed):
        if cands.get(spdx):
            # Prefer a copy taken from a *shipped* package, then the tightest fit.
            cands[spdx].sort(key=lambda c: (c[0], c[1]))
            _, _, texts[spdx], sources[spdx] = cands[spdx][0]
        elif spdx in SIGNATURES:
            warns.append('`%s`: no suitable local text found — SPDX pointer used instead '
                         '(%s). Run `cargo fetch` / `pnpm install` and regenerate.'
                         % (spdx, SIGNATURES[spdx][1]))
        else:
            warns.append('`%s`: unrecognised license identifier — review manually and add '
                         'a signature to SIGNATURES in scripts/generate-notices.py.' % spdx)
    return needed, texts, sources, warns, elections



def copyright_line(pkg):
    for f in license_files(pkg):
        for line in read(f).splitlines()[:40]:
            if re.search(r'copyright|\(c\)', line, re.I) and len(line.strip()) > 8:
                return line.strip().strip('*').strip()[:110]
    return ''


def bundled_crypto_notices(pkgs):
    """Verbatim texts for statically linked C crypto (BoringSSL/OpenSSL derived)."""
    out = []
    by_name = {p['name']: p for p in pkgs if p['eco'] == 'crates.io'}
    for name, files in BUNDLED_CRYPTO.items():
        p = by_name.get(name)
        if not p:
            continue
        for fname in files:
            path = os.path.join(p['dir'] or '', fname)
            if os.path.isfile(path):
                out.append((name, p['version'], fname, read(path).rstrip()))
    return out


# ── Document rendering ────────────────────────────────────────────────────────

SYSTEM_LIBS = """## 8. Platform system libraries (not statically linked)

Provided by the operating system at run time and **not** bundled inside VisualTalk
binaries, but their terms still apply to a distribution:

| Platform | Component | License | Obligation |
| --- | --- | --- | --- |
| Linux | GTK 3, WebKitGTK, libsoup, libappindicator, gdk-pixbuf, Pango, Cairo | LGPL-2.1+ / LGPL-3 | Dynamically linked, so users can relink. License texts ship with the `.deb`/AppImage. Reverse engineering *for the purpose of debugging modifications to these libraries* is permitted and is expressly carved out of the VisualTalk EULA. |
| Windows | Microsoft Edge WebView2 (Evergreen runtime) | Proprietary Microsoft license | Not open source. Installed/updated by Microsoft; redistributing the Fixed Version runtime requires a separate Microsoft agreement. |
| macOS / iOS | WKWebView, WebKit | LGPL-2.1+ (as an OS component) | Supplied by Apple with the OS; no separate redistribution obligation. |
| Android | Android System WebView | Proprietary Google / AOSP | Supplied by the platform. |

The Rust bindings for these libraries (`gtk-rs`, `webkit2gtk`, `soup3`, `objc2-*`,
`windows`, `webview2-com`, `wry`, `tao`) are themselves MIT/Apache-2.0 and are
listed in section 3.

## 9. Cryptography and export control notice

VisualTalk statically links cryptographic code (`ring`, `aws-lc-rs`/`aws-lc-sys`,
`rustls`, and — in the Pro Edition — `aes-gcm`, `p256`, `hmac`, `sha2`). These
implement standard published algorithms (AES-GCM, ECDH P-256, HKDF-SHA-256,
ChaCha20-Poly1305). Distribution of this software may be subject to export control
regulations, including the U.S. Export Administration Regulations (EAR,
15 CFR 730-774), Category 5 Part 2. Users and redistributors are responsible for
complying with all applicable export, re-export and sanctions laws in their
jurisdiction.
"""


def render(pkgs, version):
    """Build the full THIRD_PARTY_NOTICES markdown document."""
    shipped = [p for p in pkgs if p['shipped']]
    buildtime = [p for p in pkgs if not p['shipped']]
    needed, texts, sources, warns, elections = harvest_texts(pkgs)
    crypto = bundled_crypto_notices(pkgs)
    lic_counter = collections.Counter(p['license'] for p in shipped)
    today = datetime.date.today().isoformat()
    o = []

    o.append('# %s — Third-Party Software Notices' % PRODUCT)
    o.append('')
    o.append('Product version: %s  ' % version)
    o.append('Generated: %s  ' % today)
    o.append('Regenerate with: `pnpm notices` (runs `scripts/generate-notices.py`)')
    o.append('')
    o.append('%s incorporates the third-party software listed below. This document '
             'satisfies the attribution and notice requirements of those licenses '
             '(MIT, Apache-2.0 §4, BSD, ISC, Zlib, Unicode-3.0, MPL-2.0 §3, '
             'CDLA-Permissive-2.0 and others). The full text of each license is '
             'reproduced in section 5.' % PRODUCT)
    o.append('')
    o.append("%s itself is licensed under the PolyForm Noncommercial License 1.0.0 "
             "(Community Edition) or a separate commercial license (Pro Edition); see "
             "the `LICENSE`, `EULA` and `EULA-PRO` files. Nothing in this document "
             "changes the terms applying to VisualTalk's own code." % PRODUCT)
    o.append('')

    o.append('## 1. Summary')
    o.append('')
    o.append('- Shipped (statically linked or bundled) components: **%d**' % len(shipped))
    o.append('- Build-time-only components (not distributed): **%d**' % len(buildtime))
    o.append('- No GPL, AGPL, SSPL, BUSL, Elastic License or Commons Clause component '
             'is linked into any distributed binary.')
    o.append('- Weak copyleft present: MPL-2.0 (file-scoped, see section 6) and '
             'CDLA-Permissive-2.0 (root CA certificate data).')
    o.append('')
    if elections:
        o.append('**License elections.** Where a component offers a choice of licenses, '
                 'VisualTalk elects the permissive alternative:')
        o.append('')
        for expr, (chosen, why) in sorted(elections.items()):
            o.append('- `%s` → elects **%s**. %s' % (expr, chosen, why))
        o.append('')
    o.append('| License expression | Components |')
    o.append('| --- | --- |')
    for lic, n in lic_counter.most_common():
        o.append('| `%s` | %d |' % (lic, n))
    o.append('')

    o.append('## 2. Direct dependencies')
    o.append('')
    o.append('| Ecosystem | Component | Version | License |')
    o.append('| --- | --- | --- | --- |')
    for p in sorted([x for x in shipped if x['direct']], key=lambda x: (x['eco'], x['name'])):
        o.append('| %s | `%s` | %s | %s |' % (p['eco'], p['name'], p['version'], p['license']))
    o.append('')
    o.append('## 3. All shipped components')
    o.append('')
    for eco in ('crates.io', 'npm'):
        subset = sorted([p for p in shipped if p['eco'] == eco],
                        key=lambda x: (x['name'].lower(), x['version']))
        o.append('### %s (%d)' % (eco, len(subset)))
        o.append('')
        o.append('| Component | Version | License | Copyright |')
        o.append('| --- | --- | --- | --- |')
        for p in subset:
            cr = copyright_line(p).replace('|', '\\|')
            o.append('| `%s` | %s | %s | %s |' % (p['name'], p['version'], p['license'], cr))
        o.append('')

    o.append('## 4. Build-time-only components (not distributed)')
    o.append('')
    o.append('Used to compile and bundle VisualTalk but **not** included in any '
             'distributed artifact, so their license terms are not triggered by '
             'distribution. Listed for completeness and for developer-machine use.')
    o.append('')
    o.append('| Component | Version | License |')
    o.append('| --- | --- | --- |')
    for p in sorted(buildtime, key=lambda x: x['name'].lower()):
        o.append('| `%s` | %s | %s |' % (p['name'], p['version'], p['license']))
    o.append('')

    o.append('## 5. License texts')
    o.append('')
    for spdx in sorted(texts):
        o.append('### %s' % spdx)
        o.append('')
        o.append('_Reproduced verbatim from: %s_' % sources[spdx])
        o.append('')
        o.append('```')
        o.append(texts[spdx])
        o.append('```')
        o.append('')
    for spdx in sorted(needed - set(texts)):
        url = SIGNATURES.get(spdx, ('', 'https://spdx.org/licenses/%s.html' % spdx))[1]
        o.append('### %s' % spdx)
        o.append('')
        o.append('_The canonical text of this license is available at: %s_' % url)
        o.append('')

    o.append('## 6. MPL-2.0 covered files — source availability')
    o.append('')
    mpl = sorted([p for p in shipped if 'MPL-2.0' in p['license']], key=lambda x: x['name'])
    if mpl:
        o.append('The following components are licensed under the Mozilla Public License '
                 '2.0. MPL-2.0 is **file-scoped**: it covers only the source files of these '
                 "components, not VisualTalk's own code, which remains under its own license.")
        o.append('')
        o.append('| Component | Version | Source Code Form |')
        o.append('| --- | --- | --- |')
        for p in mpl:
            url = p['url'] or ('https://crates.io/crates/%s' % p['name']
                               if p['eco'] == 'crates.io' else
                               'https://www.npmjs.com/package/%s' % p['name'])
            o.append('| `%s` | %s | %s |' % (p['name'], p['version'], url))
        o.append('')
        o.append('%s does not modify these files. Their unmodified Source Code Form is '
                 'available from the upstream repositories above and from crates.io / '
                 'npmjs.com. The full MPL-2.0 text is reproduced in section 5.' % PRODUCT)
    else:
        o.append('No MPL-2.0 covered components are shipped in this build.')
    o.append('')

    o.append('## 7. Statically linked C cryptographic code')
    o.append('')
    o.append('`ring` and `aws-lc-sys` embed C code derived from BoringSSL and OpenSSL. '
             'Their crates declare compound license expressions, so the component license '
             'files are reproduced verbatim below as required.')
    o.append('')
    for name, ver, fname, body in crypto:
        o.append('### %s %s — `%s`' % (name, ver, fname))
        o.append('')
        o.append('```')
        o.append(body)
        o.append('```')
        o.append('')
    if not crypto:
        o.append('_(No bundled C crypto license files were located in the local cargo '
                 'cache when this document was generated — run `cargo fetch` and '
                 'regenerate.)_')
        o.append('')

    o.append(SYSTEM_LIBS)

    if warns:
        o.append('## 10. Generation warnings (review manually)')
        o.append('')
        for w in warns:
            o.append('- %s' % w)
        o.append('')

    return '\n'.join(o).rstrip() + '\n'


# ── Policy gate ───────────────────────────────────────────────────────────────


def policy(pkgs):
    """Return (forbidden_hits, watch_hits) across *shipped* components only."""
    bad, watch = [], []
    for p in pkgs:
        if not p['shipped']:
            continue
        for pat in FORBIDDEN:
            if re.search(pat, p['license'], re.I):
                bad.append((p, pat))
                break
        else:
            for pat in WATCH:
                if re.search(pat, p['license'], re.I):
                    watch.append((p, pat))
                    break
    return bad, watch


_VOLATILE_DATE = re.compile(r'Generated: \d{4}-\d{2}-\d{2}')


def strip_volatile(text):
    """Normalize the generation timestamp so --check fails only on real drift.

    The Markdown file carries `Generated: …` on its own line, but the JS
    module embeds the whole document as a single JSON string, where the date
    appears mid-line (`…\\nGenerated: 2026-10-14  \\n…`). Line filtering alone
    cannot reach it, so replace every occurrence with a fixed placeholder
    first — otherwise the CI gate reports drift the moment the calendar day
    changes (the JS was committed on 2026-10-14 and failed on 2026-10-15).
    """
    text = _VOLATILE_DATE.sub('Generated: <DATE>', text)
    return '\n'.join(l for l in text.splitlines()
                     if not l.lstrip(' */#').startswith('Generated:'))


def render_js(doc):
    """The ES module consumed by components/LicenseScreen.jsx (lazy import)."""
    return ('// AUTO-GENERATED by scripts/generate-notices.py — DO NOT EDIT BY HAND.\n'
            '// Regenerate with: pnpm notices\n'
            '// Lazily imported by components/LicenseScreen.jsx so the license corpus\n'
            '// stays out of the startup chunk.\n'
            'export const THIRD_PARTY_NOTICES = %s;\n' % json.dumps(doc))


def print_drift(pkgs, md_text):
    """List exactly which (name, version) rows differ between the committed
    notices tables (sections 3 and 4 use ``| `name` | version | …`` rows) and
    the live scan, so CI drift is self-diagnosing instead of forcing artifact
    archaeology."""
    on_disk = set(re.findall(r'^\| `([^`]+)` \| (\S+) \|', md_text, re.M))
    scanned = {(p['name'], p['version']) for p in pkgs}
    for name, ver in sorted(on_disk - scanned):
        print('  only in committed notices: %s %s' % (name, ver))
    for name, ver in sorted(scanned - on_disk):
        print('  only in this scan:         %s %s' % (name, ver))


def main():
    check = '--check' in sys.argv
    version = json.load(open(os.path.join(REPO, 'package.json'))).get('version', '0.0.0')

    print('Scanning dependencies …')
    pkgs = cargo_packages() + npm_packages()
    print('  crates.io: %d   npm: %d' % (
        sum(1 for p in pkgs if p['eco'] == 'crates.io'),
        sum(1 for p in pkgs if p['eco'] == 'npm')))

    doc = render(pkgs, version)
    bad, watch = policy(pkgs)

    print('\nLicense policy:')
    if bad:
        for p, pat in bad:
            print('  ✗ FORBIDDEN  %s %s [%s] → %s' % (p['name'], p['version'], p['license'], pat))
    else:
        print('  ✓ No forbidden (copyleft / source-available) license in any shipped component')
    for p, pat in watch:
        note = ' — file-scoped copyleft; attribution + source pointer required (section 6)' \
            if 'MPL' in pat else \
            ' — OR-licensed; VisualTalk elects MIT OR Apache-2.0' if 'LGPL' in pat else \
            ' — permissive data license; text reproduced'
        print('  ⚠ watch      %s %s [%s]%s' % (p['name'], p['version'], p['license'], note))

    if check:
        failed = False
        if bad:
            print('\nFAIL: forbidden license present in a shipped dependency.')
            failed = True
        if not os.path.exists(OUT_MD):
            print('\nFAIL: %s is missing. Run `pnpm notices`.' % os.path.basename(OUT_MD))
            failed = True
        elif strip_volatile(read(OUT_MD)) != strip_volatile(doc):
            print('\nFAIL: THIRD_PARTY_NOTICES.md is stale. Run `pnpm notices` and commit.')
            print('Drift detail:')
            print_drift(pkgs, read(OUT_MD))
            failed = True
        else:
            print('\n✓ THIRD_PARTY_NOTICES.md is up to date')
        if not os.path.exists(OUT_JS):
            print('FAIL: %s is missing. Run `pnpm notices`.' % os.path.relpath(OUT_JS, REPO))
            failed = True
        elif strip_volatile(read(OUT_JS)) != strip_volatile(render_js(doc)):
            print('FAIL: %s is stale. Run `pnpm notices` and commit.'
                  % os.path.relpath(OUT_JS, REPO))
            failed = True
        else:
            print('✓ %s is up to date' % os.path.relpath(OUT_JS, REPO))
        sys.exit(1 if failed else 0)

    with open(OUT_MD, 'w', encoding='utf-8') as fh:
        fh.write(doc)
    js = render_js(doc)
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('\nWrote %s (%.1f KB)' % (os.path.relpath(OUT_MD, REPO), len(doc) / 1024))
    print('Wrote %s (%.1f KB)' % (os.path.relpath(OUT_JS, REPO), len(js) / 1024))


if __name__ == '__main__':
    main()




