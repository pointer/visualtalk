---
description: Run the VisualTalk medium lane for multi-file work with lightweight discovery and planned execution
agent: orchestrator
---

Treat `$ARGUMENTS` as the user's request for the VisualTalk repo.

Run the medium lane for work that likely touches multiple files or layers but does not justify the full feature design loop.

Read `AGENTS.md` and `Guidance.md` before planning.

Workflow:

1. Intake
   - Clarify only if scope, acceptance criteria, or boundaries are materially ambiguous.

2. Lightweight discovery
   - Delegate narrowly scoped mapping to `@discovery`.
   - Stop once you have enough evidence to scope the change safely.

3. Goal setting
   - Define the concrete behavior change, affected surfaces, assumptions, non-goals, and whether Pro/E2EE is involved.

4. Scoped approach
   - Propose a compact repo-fit approach with likely files, symbols, constraints, and verification.
   - Present the main decisions and risks first.
   - Use the `question` tool to confirm or revise before track planning.

5. Track planning
   - Delegate the approved approach and repo evidence to `@feature-manager`.
   - Ask for builder-ready tracks with explicit order and verification.
   - Present the tracks concisely.
   - Use the `question` tool to confirm or revise before final approval.

6. Approval gate
   - Use the `question` tool to ask for exactly one final `[y/N/edit]`.

7. Execute
   - Delegate each approved track to `@builder`, one at a time unless explicitly `parallel-safe`.
   - If a builder reports ambiguity or `PIVOT_REQUIRED`, stop and reassess.

8. Wrap up
   - Report implementation status, changed files, validations run, and residual risks.
   - Require `vt-verify` for the changed area.

Guardrails:

- Keep the process lighter than `/feature` and heavier than `/quick`.
- Prefer extending existing patterns over inventing new structure.
- If discovery shows the task is too small or too large, recommend `/quick`, `/debug`, or `/feature`.
