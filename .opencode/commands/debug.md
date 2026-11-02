---
description: Run the VisualTalk debug lane from symptoms to evidence to a narrow fix
agent: orchestrator
---

Treat `$ARGUMENTS` as the user's bug report or debugging request for the VisualTalk repo.

Run the debug lane when the work is about understanding symptoms, finding a root cause, and driving the smallest safe fix.

Read `AGENTS.md` and `Guidance.md` before planning.

Workflow:

1. Triage
   - Clarify expected vs actual behavior, scope, regression signal, and definition of done only when those facts materially affect the fix.
   - Identify the layer: SolidJS UI, LiveKit wrapper, Tauri command, Rust core, build/signing, or macOS permissions.

2. Map the failure
   - Delegate to `@discovery` for entrypoints, suspect files, repro paths, relevant tests, and ranked root-cause candidates unless the user already supplied enough evidence.
   - For camera, microphone, or screen-share failures, include the permission chain: `Info*.plist`, `Entitlements.plist`, `capabilities/default.json`, `tauri*.conf.json`, and TCC state.

3. Hypothesis
   - State the most likely root cause and the evidence supporting it.
   - Name one falsification check.
   - Present the hypothesis decision-first.
   - Use the `question` tool to confirm or revise before finalizing the fix plan.

4. Fix plan
   - Write the smallest targeted change set with exact files, symbols, constraints against drive-by refactors, and the most relevant verification.
   - Include the relevant `vt-verify` checks.

5. Critique
   - Use `@reviewer` when risk is non-trivial.
   - For E2EE or security bugs, require the `e2ee-review` checklist.
   - Use the `question` tool to decide proceed, revise, or stop.

6. Approval gate
   - Use the `question` tool to ask for exactly one final `[y/N/edit]` before any delegated edits.

7. Execution
   - After approval, delegate the plan to `@builder`.
   - If the builder reports `PIVOT_REQUIRED`, stop and re-plan from evidence.

8. Verify and wrap
   - Confirm the repro path or failing test is addressed.
   - Report what was fixed, what remains uncertain, validations run, and follow-up checks.
   - List manual macOS verification needed if permissions were involved.

Guardrails:

- Keep the narrative evidence-first.
- Prefer one primary hypothesis over a long list.
- Do not broaden the fix into unrelated cleanup.
- Do not weaken security, logging, or checks to make a symptom disappear.
