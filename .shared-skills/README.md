# Shared Skills

Portable, project-agnostic agent skills. Copy the skill folder you want into your
own project's skills directory (`.agent/skills/` for Claude Code and similar,
`.opencode/skills/` for OpenCode).

Each skill is a template. **Replace every `<project-name>` placeholder** with your
project's name before use.

| Skill | Use it for |
|---|---|
| `change-review` | Review a PR, diff, or code change: security, correctness, tests, maintainability. Read-only. |
| `verify` | Run a project's build/test/format checks before claiming a change is done. Detects the toolchain. |
| `security-review` | Audit a security-sensitive change: auth, encryption, key management, fail-open paths. Read-only. |

All three are read-only by default: they report findings and never edit files
unless explicitly told to.

## License

MIT. See the header in each `SKILL.md`.