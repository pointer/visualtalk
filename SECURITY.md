# Security Policy

## Credentials: Settings store only — never in the repo

VisualTalk is bring-your-own-server. The app ships **no** default LiveKit
server and **no** embedded credentials.

| Credential | Where it lives | Never in |
|---|---|---|
| LiveKit URL / API key / API secret | Tauri store: `livekit.json` in the OS app-config dir, entered via **Settings → LiveKit** | source code, `.env`, CI config, commits |
| AI assistant API key | App settings; optional `AI_API_KEY` env for local dev only | commits |

Rules for contributors:

1. **No secret may ever be committed** — not even in a "temporary" commit.
   History rewrites are painful and leaked keys must be treated as compromised
   the moment they are pushed.
2. `.env*` files are gitignored. Do not force-add them (`git add -f`).
3. A [gitleaks](https://github.com/gitleaks/gitleaks) pre-commit hook scans
   every staged change and blocks commits containing secrets. Enable it once
   per clone:

   ```bash
   brew install gitleaks            # one-time
   git config core.hooksPath scripts/git-hooks
   ```

   Do not bypass it with `--no-verify`.
4. Signing secrets must never be compiled into a shipped binary — they are
   recoverable by anyone with `strings`. Token minting for a distributed
   build belongs on a server the user controls.

## If a secret is ever committed

1. **Rotate the key immediately** — assume it is compromised from the moment
   of the push, not from the moment of discovery.
2. Scrub history (e.g. `git filter-repo`), then force-push.
3. Ask GitHub Support to run garbage collection on the repository so cached
   views of the old commits are purged.
4. Check for forks — they retain the dirty history and may need takedown.

## Reporting a vulnerability

Please report security issues privately via the contact in the repository's
GitHub profile (or open a private security advisory on GitHub). Do **not**
file a public issue for anything that could put users' credentials or
recordings at risk.
