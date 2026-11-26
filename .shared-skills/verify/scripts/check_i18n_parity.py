"""Check that the en/fr/es locale files stay in parity.

Parity is a ship requirement: every feature that adds a key must add it to all
three files, and `t()` silently renders the raw key when one is missing
(see I18nProvider.jsx), so drift surfaces in the UI as "settings.someKey".

Failures (exit 1): a key present in en.json but missing from fr/es, or a key
present in fr/es but absent from en.
Warnings (exit 0): an empty value, or a value identical to the English one, which
is how an untranslated string hides. Genuinely identical loanwords are listed in
IDENTICAL_OK - add to that set only when the term really is the same in all three
languages; otherwise translate the value.

Like the other guards in this directory, paths are resolved from the file's own
location so the script works from any working directory.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCALES = ROOT / "src" / "locales"
SOURCE = "en"
TARGETS = ("fr", "es")

# Terms legitimately spelled the same in en/fr/es. Compared exactly.
IDENTICAL_OK = {
    "Audio",
    "Chat",
    "Date",
    "Description",
    "LiveKit",
    "Messages",
    "Microphone",
    "Notes",
    "PMI",
    "Video",
    "alice@example.com, bob@example.com",
}


def flatten(data, prefix=""):
    """Nested dicts -> {dotted.key: leaf value}."""
    out = {}
    for key, val in data.items():
        path = f"{prefix}{key}"
        if isinstance(val, dict):
            out.update(flatten(val, f"{path}."))
        else:
            out[path] = val
    return out


def load(locale):
    path = LOCALES / f"{locale}.json"
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return flatten(json.load(f))


def main():
    en = load(SOURCE)
    targets = {loc: load(loc) for loc in TARGETS}

    failed = False
    warnings = []

    for loc, data in targets.items():
        missing = sorted(set(en) - set(data))
        extra = sorted(set(data) - set(en))
        if missing:
            print(f"MISSING in {loc}.json ({len(missing)}): {', '.join(missing)}")
            failed = True
        if extra:
            print(f"EXTRA in {loc}.json ({len(extra)}): {', '.join(extra)}")
            failed = True

        for key in sorted(set(en) & set(data)):
            val, src = data[key], en[key]
            if not isinstance(val, str) or not isinstance(src, str):
                continue
            if val.strip() == "":
                warnings.append(f"{loc}.json '{key}' is empty")
            elif val == src and val not in IDENTICAL_OK and len(val) > 1:
                warnings.append(f"{loc}.json '{key}' is still English: {val!r}")

    if warnings:
        print(f"WARNINGS ({len(warnings)}) - review these; they do not fail the build:")
        for w in warnings:
            print(f"  {w}")

    if failed:
        return 1

    print(f"OK: en/fr/es parity ({len(en)} keys)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
