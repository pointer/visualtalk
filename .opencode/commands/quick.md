---
description: Run the VisualTalk quick lane for small isolated changes with one tiny plan and one build track
agent: orchestrator
---

Treat `$ARGUMENTS` as the user's request for the VisualTalk repo.

Run the quick lane only when the task is small, local, and low-risk enough for one builder track.

Read `AGENTS.md` and `Guidance.md` before planning.

Workflow:

1. Quick scope check
   - Confirm the request is narrow enough for one builder run.
   - If it is broader, riskier, or bug work, recommend `/medium`, `/feature`, or `/debug` instead.

2. Minimal context gathering
   - Delegate to `@discovery` only when exact file targets, symbols, or validation hints are needed.
   - Keep discovery narrow.

3. Tiny plan
   - Produce one compact track with the goal, exact files when known, constraints, and the smallest useful verification.
   - Include the relevant `vt-verify` checks.
   - Use the `question` tool to confirm or revise the plan.

4. Approval gate
   - Use the `question` tool to ask for exactly one final `[y/N/edit]`.

5. Execute
   - Delegate exactly one focused track to `@builder`.
   - Do not open multiple tracks.
   - If the builder reports ambiguity or `PIVOT_REQUIRED`, stop and reassess.

6. Wrap up
   - Report files changed, validations run, residual risks, and any reason the task should have been escalated.

Guardrails:

- Keep the lane fast.
- Do not skip the approval gate.
- Do not add design or adversarial review steps without escalating to another lane.
- Do not allow drive-by refactors or dependency changes.
