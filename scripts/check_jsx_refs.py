"""Catch JSX components that are referenced but never imported or declared.

Vite/rolldown does NOT warn about this: an unknown capitalised JSX tag becomes a
bare global reference and only fails at runtime, when that branch renders. That
is exactly how a partially-applied component extraction slips through a green
`pnpm build`.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / "src"
# Provided by solid-js / the compiler, not by an import in our files.
BUILTIN = {'Show', 'For', 'Switch', 'Match', 'Suspense', 'ErrorBoundary', 'Portal',
           'Dynamic', 'Index', 'Fragment'}


def check(path):
    text = path.read_text()
    imported = set()
    for m in re.finditer(r'^import\s+(?:\{([^}]*)\}|(\w+))\s+from', text, re.M):
        if m.group(1):
            for part in m.group(1).split(','):
                part = part.strip()
                if part:
                    imported.add(part.split(' as ')[-1].strip())
        elif m.group(2):
            imported.add(m.group(2))
    # default imports:  import Foo from "..."
    imported |= set(re.findall(r'^import\s+(\w+)\s+from', text, re.M))

    declared = set(re.findall(r'\b(?:const|let|var|function|class)\s+([A-Z]\w*)', text))
    # destructured locals:  const { A, B } = ...
    for m in re.finditer(r'\b(?:const|let)\s*\{([^}]*)\}\s*=', text):
        for part in m.group(1).split(','):
            part = part.strip()
            if part:
                declared.add(part.split(':')[-1].strip())
    # function parameters that are components, e.g. (props) => ... props.Foo
    params = set(re.findall(r'\bfunction\s+[A-Z]\w*\s*\(([^)]*)\)', text))

    used = set(re.findall(r'<([A-Z]\w*)[\s/>]', text))
    known = imported | declared | BUILTIN
    missing = sorted(u for u in used if u not in known)
    return missing


def main():
    targets = sys.argv[1:] or [str(p) for p in ROOT.rglob('*.jsx')]
    bad = 0
    for t in targets:
        p = pathlib.Path(t)
        missing = check(p)
        if missing:
            bad += 1
            try:
                label = str(p.relative_to(ROOT.parent))
            except ValueError:
                label = str(p)
            print('MISSING in %s: %s' % (label, ', '.join(missing)))
    if not bad:
        print('OK: every capitalised JSX tag is imported or declared (%d files)' % len(targets))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
