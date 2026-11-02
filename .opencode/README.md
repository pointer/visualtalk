# VisualTalk OpenCode layer

Project-local agents, lane commands, and skills for VisualTalk. This does not replace
`AGENTS.md` or `Guidance.md`; it adds a workflow on top of them.

## Start

Open OpenCode in the VisualTalk repo and select the `orchestrator` agent. The
orchestrator plans and delegates; it does not edit files itself.

```text
/quick   small, local, low-risk change
/medium  multi-file change
/feature design + review + planned tracks
/debug   symptom -> evidence -> narrow fix
```

Each lane ends with an explicit approval gate before any edit. Nothing is built until
you answer it.

## Files

| Path | Purpose |
| --- | --- |
| `agents/orchestrator.md` | Primary agent. Runs lanes, delegates, never edits. |
| `agents/discovery.md` | Read-only repo mapping and evidence gathering. |
| `agents/reviewer.md` | Adversarial critique before edits. |
| `agents/feature-manager.md` | Approved design -> narrow builder tracks. |
| `agents/builder.md` | Executes exactly one approved track. |
| `commands/*.md` | The four lane workflows. |
| `skills/vt-verify/` | Verification checklist for any change. |
| `skills/e2ee-review/` | Pro/E2EE audit checklist. |

## Models

Set per agent in frontmatter:

| Agent | Model | Why |
| --- | --- | --- |
| orchestrator | `opencode/gpt-5.3-codex` | Strong planning and delegation |
| discovery | `fireworks-ai/.../kimi-k2p6-turbo` | Fast repo mapping |
| reviewer | `fireworks-ai/.../kimi-k2p6-turbo` | Independent critique |
| feature-manager | `opencode/deepseek-v4.1-flash-free` | Free planning model |
| builder | `fireworks-ai/.../kimi-k2p6-turbo` | Implementation |

To use a fully local model instead, change `feature-manager` to
`ollama/deepseek-r1:8b` (requires a running Ollama with that model pulled).

Check available IDs with:

```bash
opencode models
```

## Skills

- `vt-verify` - run before claiming a change is done: cargo check/test, pnpm build,
  notices/license checks, diff hygiene, permission-surface checks.
- `e2ee-review` - use for any Pro/E2EE design or code review. Covers key authenticity,
  sender binding, replay, file-chunk integrity, fail-open paths, key lifecycle, and
  zeroization.

## Deliberately not included

- MCP is limited to `context7` (library documentation), configured in the project
  `opencode.json`. See `docs/decisions/0001-tooling-and-mcp-policy.md`.
- No Graphify, no GSD Core. Graphify indexes source remotely; GSD duplicates the lane
  workflow already implemented here.
- No Telegram notifications or stop-hook automation.
- No global config changes; tools stay project-scoped.
- No superpowers dependency; this setup uses agents, commands, skills, and the
  Impeccable CLI.
