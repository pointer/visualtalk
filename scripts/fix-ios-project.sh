#!/usr/bin/env bash
# fix-ios-project.sh — Re-apply local iOS project fixes after `tauri ios init`.
#
# `src-tauri/gen/` is gitignored and `tauri ios init` regenerates it from
# Tauri's own templates, so every `pnpm ios:clean && pnpm ios:init` wipes these
# local fixes:
#
#   1. DEVELOPMENT_TEAM must be the Team ID — the OU field of your Apple
#      Development certificate — NOT the personal Apple ID identifier shown in
#      the certificate CN parentheses, e.g.
#      "Apple Development: you@example.com (5X2L969SX6)". A wrong value makes
#      Xcode fail with 'No Account for Team "..."' plus
#      'No profiles for "<bundle id>" were found'.
#   2. CODE_SIGN_STYLE = Automatic and CODE_SIGN_IDENTITY = Apple Development.
#      Tauri's template emits neither, leaving Xcode to fall back to the legacy
#      "iPhone Developer" identity, which breaks automatic signing on a
#      Personal Team.
#   3. The `Externals` source entry must exclude **/*.a, otherwise xcodegen
#      turns the per-configuration libapp.a copies into colliding resources
#      ("Multiple commands produce .../libapp.a"). Tauri's current template
#      already sets this, so it is guarded rather than patched.
#   4. The "Build Rust Code" phase must anchor pnpm to the repo root. That
#      phase runs with cwd = src-tauri/gen/apple, which has no package.json, so
#      a bare `pnpm tauri ...` falls back to pnpm recursive-exec and dies with
#      ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL ('Command "tauri" not found').
#   5. AppIcon.appiconset must carry the real app icons. Init renders the asset
#      catalog from CLI-embedded templates (Tauri placeholder icons), never
#      reads src-tauri/icons/, and skips existing files — so the catalog keeps
#      the placeholder forever. Handled by scripts/sync-ios-icons.sh below.
#
# Usage:
#   ./scripts/fix-ios-project.sh                # patch + regenerate .xcodeproj
#   ./scripts/fix-ios-project.sh --check        # report drift only (exit 1 if any)
#   ./scripts/fix-ios-project.sh --no-xcodegen  # patch project.yml only
#
# Idempotent: running it repeatedly makes no further changes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPLE_DIR="$REPO_ROOT/src-tauri/gen/apple"
PROJECT_YML="$APPLE_DIR/project.yml"
TAURI_CONF="$REPO_ROOT/src-tauri/tauri.conf.json"

CHECK_ONLY=0
RUN_XCODEGEN=1
for arg in "$@"; do
  case "$arg" in
    --check)       CHECK_ONLY=1; RUN_XCODEGEN=0 ;;
    --no-xcodegen) RUN_XCODEGEN=0 ;;
    -h|--help)     awk 'NR>1 && /^#/ { sub(/^#[[:space:]]?/, ""); print; next }
                     NR>1 { exit }' "$0"; exit 0 ;;
    *)             echo "❌ Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

if [ ! -f "$PROJECT_YML" ]; then
  echo "❌ $PROJECT_YML not found."
  echo "   Run 'pnpm ios:init' first (this script is hooked into it)."
  exit 1
fi


# ---------------------------------------------------------------------------
# Resolve the expected Team ID. APPLE_DEVELOPMENT_TEAM wins because that is
# what the Tauri CLI itself honours (it overwrites bundle.iOS.developmentTeam);
# falling back to the config keeps this script useful when the env is unset.
# ---------------------------------------------------------------------------
EXPECTED_TEAM="${APPLE_DEVELOPMENT_TEAM:-}"
if [ -z "$EXPECTED_TEAM" ]; then
  EXPECTED_TEAM="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    conf = json.load(f)
ios = (conf.get("bundle") or {}).get("iOS") or {}
print(ios.get("developmentTeam") or "")
' "$TAURI_CONF" 2>/dev/null || true)"
fi

if [ -z "$EXPECTED_TEAM" ]; then
  echo "❌ Could not resolve a Team ID."
  echo "   Set APPLE_DEVELOPMENT_TEAM, or bundle.iOS.developmentTeam in"
  echo "   src-tauri/tauri.conf.json, to your Team ID."
  echo "   Find it in Xcode > Settings > Accounts > your Apple ID > Team."
  exit 1
fi

# A Team ID is exactly 10 uppercase alphanumerics. Anything else means someone
# supplied the team *name* or the Apple ID identifier — the two bugs that cause
# 'No Account for Team' / 'No profiles for ... were found'.
if ! printf '%s' "$EXPECTED_TEAM" | grep -Eq '^[A-Z0-9]{10}$'; then
  echo "❌ '$EXPECTED_TEAM' does not look like a Team ID"
  echo "   (expected exactly 10 uppercase letters/digits)."
  echo ""
  echo "   Read the real Team ID off your signing certificate's OU field:"
  echo "     security find-certificate -a -c 'Apple Development' -p \\"
  echo "       | openssl x509 -noout -subject"
  echo "   The value you want is OU=..., NOT the (...) inside CN=."
  exit 1
fi

# ---------------------------------------------------------------------------
# Format alone is not enough: the personal Apple ID identifier (the (...) in
# the certificate CN) is *also* 10 uppercase alphanumerics, which is exactly
# the mistake this script exists to prevent. So cross-check against the OU of
# every installed Apple Development certificate — the authoritative Team ID.
# ---------------------------------------------------------------------------
CERT_DIR="$(mktemp -d)"
security find-certificate -a -c 'Apple Development' -p 2>/dev/null \
  | awk -v dir="$CERT_DIR" '
      /-----BEGIN CERTIFICATE-----/ { n++; f = sprintf("%s/c%d.pem", dir, n) }
      n { print > f }
    '
KNOWN_TEAMS=""
for pem in "$CERT_DIR"/*.pem; do
  [ -e "$pem" ] || continue
  ou="$(openssl x509 -noout -subject -in "$pem" 2>/dev/null \
        | sed -n 's/.*OU[[:space:]]*=[[:space:]]*\([A-Za-z0-9]*\).*/\1/p')"
  if [ -n "$ou" ]; then
    case " $KNOWN_TEAMS " in
      *" $ou "*) ;;
      *) KNOWN_TEAMS="$KNOWN_TEAMS $ou" ;;
    esac
  fi
done
rm -rf "$CERT_DIR"
KNOWN_TEAMS="$(printf '%s' "$KNOWN_TEAMS" | sed 's/^ *//')"

if [ -n "$KNOWN_TEAMS" ]; then
  case " $KNOWN_TEAMS " in
    *" $EXPECTED_TEAM "*)
      ;;
    *)
      echo "❌ '$EXPECTED_TEAM' is not a Team ID on any installed Apple"
      echo "   Development certificate."
      echo ""
      echo "   Team IDs found on your certificates: $KNOWN_TEAMS"
      echo ""
      echo "   If you meant the identifier in the certificate CN parentheses,"
      echo "   that is your personal Apple ID, not a Team ID — Xcode rejects it"
      echo "   with 'No Account for Team'. Use one of the values above."
      echo ""
      echo "   Update it in ~/.zshrc (APPLE_DEVELOPMENT_TEAM) and/or"
      echo "   src-tauri/tauri.conf.json (bundle.iOS.developmentTeam)."
      exit 1
      ;;
  esac
elif [ "$CHECK_ONLY" -eq 0 ]; then
  echo "⚠️  No Apple Development certificates found; cannot verify that"
  echo "   '$EXPECTED_TEAM' is a real Team ID. Proceeding on trust."
fi



# ---------------------------------------------------------------------------
# Patch project.yml. Prints one line per change; nothing if already clean.
# ---------------------------------------------------------------------------
REPORT="$(EXPECTED_TEAM="$EXPECTED_TEAM" CHECK_ONLY="$CHECK_ONLY" \
  python3 - "$PROJECT_YML" <<'PY'
import os, re, sys

path = sys.argv[1]
team = os.environ["EXPECTED_TEAM"]
check_only = os.environ["CHECK_ONLY"] == "1"

with open(path) as f:
    src = f.read()
lines = src.split("\n")
changes = []


def set_kv(body, key, val, after=None):
    """Set `key: val` at the 6-space setting indent, inserting after `after`."""
    for n, line in enumerate(body):
        m = re.match(r"\s*" + re.escape(key) + r"\s*:\s*(.*)$", line)
        if m:
            if m.group(1).strip() != val:
                changes.append("%s: %s -> %s"
                               % (key, m.group(1).strip() or "(empty)", val))
                body[n] = "      %s: %s" % (key, val)
            return
    pos = len(body) - 1
    if after:
        for n, line in enumerate(body):
            if re.match(r"\s*" + re.escape(after) + r"\s*:", line):
                pos = n
                break
    changes.append("%s: (absent) -> %s" % (key, val))
    body.insert(pos + 1, "      %s: %s" % (key, val))


def locate_base():
    """Line span of the settingGroups.app.base body."""
    def nxt(want, start):
        for n in range(start, len(lines)):
            if lines[n].rstrip() == want:
                return n
        return None
    i = nxt("settingGroups:", 0)
    if i is None:
        return None
    i = nxt("  app:", i + 1)
    if i is None:
        return None
    i = nxt("    base:", i + 1)
    if i is None:
        return None
    end = i + 1
    while end < len(lines) and (lines[end].startswith("      ")
                                or not lines[end].strip()):
        end += 1
    return (i + 1, end)


# --- fixes 1 & 2: signing settings ------------------------------------------
span = locate_base()
if span is None:
    changes.append("MISSING settingGroups.app.base - cannot patch signing")
else:
    s, e = span
    body = lines[s:e]
    set_kv(body, "DEVELOPMENT_TEAM", team)
    set_kv(body, "CODE_SIGN_STYLE", "Automatic", after="DEVELOPMENT_TEAM")
    set_kv(body, "CODE_SIGN_IDENTITY", "Apple Development",
           after="CODE_SIGN_STYLE")
    lines[s:e] = body

# --- fix 3: keep built static libs out of the resource bundle ---------------
for n, line in enumerate(lines):
    if line.rstrip() == "      - path: Externals":
        following = lines[n + 1] if n + 1 < len(lines) else ""
        if "excludes:" not in following:
            changes.append('Externals: add excludes ["**/*.a"]')
            lines.insert(n + 1, '        excludes: ["**/*.a"]')
        break

# --- fix 4: anchor pnpm to the repo root in the Build Rust Code phase -------
ANCHOR = ('cd "$SRCROOT/../../.." && '
          'if [ -f .review-creds.sh ]; then . ./.review-creds.sh; fi && '
          'pnpm tauri ios xcode-script')
pat = re.compile(r'(?:cd "\$SRCROOT/\.\./\.\./\.\." && )?'
                 r'(?:if \[ -f \.review-creds\.sh \]; then '
                 r'\. \./\.review-creds\.sh; fi && )?'
                 r'pnpm\s+(?:--dir\s+"[^"]*"\s+)?tauri\s+ios\s+xcode-script')
found = False
for n, line in enumerate(lines):
    if "tauri ios xcode-script" in line:
        found = True
        if ANCHOR not in line:
            changes.append('Build Rust Code: anchor to repo root (pnpm --dir '
                           'is broken on pnpm 9 and 12) and source '
                           '.review-creds.sh so review-build demo credentials '
                           'reach cargo despite Xcode phase env sanitizing')
            lines[n] = pat.sub(ANCHOR, line, count=1)
        break
if not found:
    changes.append("MISSING `tauri ios xcode-script` phase - cannot patch pnpm")

out = "\n".join(lines)
if changes and not check_only and out != src:
    with open(path, "w") as f:
        f.write(out)

for c in changes:
    print(c)
PY
)"

if [ -n "$REPORT" ]; then
  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "⚠️  project.yml has drifted from the local iOS fixes:"
    while IFS= read -r line; do echo "     • $line"; done <<< "$REPORT"
    echo ""
    echo "   Re-apply with: ./scripts/fix-ios-project.sh"
    exit 1
  fi
  echo "🔧 Patched $PROJECT_YML:"
  while IFS= read -r line; do echo "     • $line"; done <<< "$REPORT"
else
  echo "✅ project.yml already correct (Team $EXPECTED_TEAM)."
  if [ "$CHECK_ONLY" -eq 1 ]; then
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Fix 5: sync the real app icons into the asset catalog (tauri ios init seeds
# it with Tauri's placeholder icons and never reads src-tauri/icons/).
# ---------------------------------------------------------------------------
if [ "$CHECK_ONLY" -eq 1 ]; then
  "$REPO_ROOT/scripts/sync-ios-icons.sh" --check
else
  "$REPO_ROOT/scripts/sync-ios-icons.sh"
fi

# ---------------------------------------------------------------------------
# Regenerate the Xcode project so the pbxproj picks up project.yml
# ---------------------------------------------------------------------------
if [ "$RUN_XCODEGEN" -eq 1 ]; then
  if ! command -v xcodegen >/dev/null 2>&1; then
    echo "❌ xcodegen not found — install with: brew install xcodegen"
    echo "   project.yml was patched, but the .xcodeproj still carries the old"
    echo "   settings. Re-run this script once xcodegen is available."
    exit 1
  fi
  echo "⚙️  Regenerating visualtalk.xcodeproj …"
  ( cd "$APPLE_DIR" && xcodegen generate >/dev/null )
  echo "✅ Regenerated $APPLE_DIR/visualtalk.xcodeproj"
fi

echo ""
echo "Next: pnpm ios:dev   (or pnpm ios:build)"

