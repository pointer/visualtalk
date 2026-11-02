# 0001: Tooling and MCP policy

- Date: 2026-11-02
- Status: accepted

## Context

`.opencode/README.md` originally excluded all MCP servers and plugins. In practice the
agent layer still had two gaps: it could not look up current APIs for fast-moving
dependencies (Tauri v2, LiveKit, Solid, Tailwind v4, Vite), and nothing evaluated the
interface after a build passed. The same decisions were also being re-argued across
sessions.

## Decision

1. Allow one MCP server: `context7` (remote, read-only library documentation),
   configured in the project `opencode.json`. It is used for third-party API questions
   only.
2. Use the Impeccable CLI (`npx impeccable detect`) as a review aid on changed JSX/CSS,
   wired into `vt-verify`. It is not an auto-fixer and not a CI blocker by default.
3. Keep durable decisions in `docs/decisions/`.
4. Do not add Graphify: it indexes source remotely, which is not acceptable for a
   privacy-first product without a separate review. Do not add GSD Core: the
   `.opencode/` lanes already implement that loop.
5. No global config changes; tooling stays project-scoped.

## Consequences

- `opencode.json` is now part of the repo and must be reviewed like code.
- Agents must cite Context7 when they use it, and must not send proprietary code,
  keys, or secrets in documentation queries.
- Impeccable findings are advisory input to review; pre-existing findings in untouched
  files are not blockers.
- Reversing any of this requires a new ADR, not an edit to this file.
