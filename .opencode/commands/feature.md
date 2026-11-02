---
description: Run the VisualTalk feature lane with discovery, critique, approval, and narrow builder tracks
agent: orchestrator
---

Treat `$ARGUMENTS` as the user's request for the VisualTalk repo.

Run the feature lane for broader, riskier, or architecture-sensitive work.

Read `AGENTS.md` and `Guidance.md` before planning.

Workflow:

1. Intake
   - Clarify only what materially changes scope, acceptance criteria, or risk.
   - Identify whether the work is Community, Pro/E2EE, release, or compliance.

2. Discovery
   - Delegate to `@discovery`.
   - Ask for existing patterns, likely edit points, validation paths, and major risk areas.
   - Require evidence from the repo, not guesses.

3. Initial plan
   - Draft an implementation direction with likely files, validation, and risks.
   - Present the main decision first.
   - Use the `question` tool to confirm or revise before detailed design.

4. Detailed design
   - Prefer extending existing abstractions over adding new ones.
   - Cover Rust command boundaries, frontend hook/component boundaries, and config/permission consistency when relevant.
   - Present tradeoffs and open risks.
   - Use the `question` tool to confirm or revise before critique.

5. Adversarial review
   - Send the design to `@reviewer`.
   - For E2EE or security work, require the `e2ee-review` checklist.
   - Incorporate only evidence-backed objections.
   - Use the `question` tool to decide proceed, revise, or stop.

6. Build plan
   - Delegate track planning to `@feature-manager` with the approved design and repo evidence.
   - Expect narrow, literal tracks with exact files, symbols, constraints, order, and verification.
   - Do not collapse or merge tracks.

7. Approval gate
   - Present the final plan with track order and verification.
   - Use the `question` tool to ask for exactly one final `[y/N/edit]`.

8. Execution
   - After approval, assign one track at a time to `@builder`.
   - Run dependent tracks in order; parallelize only tracks marked `parallel-safe`.
   - If a builder returns `PIVOT_REQUIRED`, stop and re-plan from evidence.

9. Verification
   - Require `vt-verify` results for the changed area.
   - Minimum for code: `cd src-tauri && cargo check && cargo test` and `pnpm build`.
   - Use `cargo test --features e2ee` only when the private Pro sources are present.
   - If dependencies changed, require `pnpm notices` and `pnpm license:check`.
   - If plists, entitlements, capabilities, or CSP changed, list the manual macOS checks.

10. Wrap up
   - Report changed files, validations actually run, residual risks, and manual checks.
   - State explicitly if the work could not be fully verified.

Guardrails:

- Do not skip the approval gate.
- Do not let a builder edit outside its track.
- Do not add dependencies without a stated reason.
- Do not treat UI labels or docs as proof of encryption or permission behavior.
