---
name: change-review
description: Review a pull request, diff, or code change before it ships. Use when reviewing commits, branches, or pull requests; auditing a diff for security, correctness, tests, and maintainability; or doing a final pass before merge. Read-only by default: reports findings, never edits files unless explicitly told to.
---

<!--
MIT License

Copyright (c) 2026 <project-name> contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->

# Change Review

A read-only review workflow for pull requests, diffs, and code changes. The output
is a structured report a human can act on. It is project-agnostic: adapt the
build/test commands in step 5 to the repository you are reviewing.

## Non-negotiable rule

**Do not modify, stage, commit, or delete any file unless the user explicitly
instructs you to make changes.** This skill produces a review, not edits. If you
spot a problem, describe it and point at the exact file and line; let the user
decide what to fix. Running read-only inspection commands (diff, log, grep,
read) is expected and encouraged; running anything that writes to the repo is not.

## 1. Scope the change

Establish exactly what is under review. Do not review the whole repo by default.

```bash
git status --short
git diff --stat                 # working tree
git diff --stat <base>...<head> # a branch or PR range, if given
git log --oneline <base>..<head>
```

If a PR number or branch range is provided, review that range. Otherwise review
the working-tree diff. Classify the surface:

- frontend / UI
- backend / service
- API or contract change
- config, permissions, or infrastructure change
- docs only
- dependency change

Only run the checks below that apply to the surface. Say which you ran and which
you skipped and why.

## 2. Understand intent

Before judging the code, restate what the change is trying to do, in one or two
sentences, from the diff and the PR/commit message. If intent is unclear, that is
itself a finding. Check that the change is cohesive — a diff that mixes an
unrelated refactor with a feature is a maintainability finding.

## 3. Security

Look for, with exact file/line references:

- **Secrets** — API keys, tokens, passwords, private endpoints committed or
  logged.
- **AuthZ/AuthN** — new endpoints without authorization; IDOR; missing ownership
  checks; privilege escalation.
- **Injection** — SQL, shell, template, path traversal, SSRF; untrusted input
  reaching a sink unsanitized.
- **Crypto** — weak or misused primitives, non-constant-time comparisons,
  fail-open paths (encryption that silently degrades to plaintext).
- **Dependencies** — new packages for a non-obvious reason; known-vuln risk;
  typosquat-shaped names; lockfile changes.
- **Data exposure** — PII or secrets in logs, error messages, or analytics.
- **Platform surfaces** — CSP, permissions, signing, or capabilities changed
  beyond the task's scope.

## 4. Correctness

- Does the change do what its intent (step 2) claims?
- Edge cases: empty, null, zero, concurrent, error, and rollback paths.
- Error handling: are failures surfaced honestly, or swallowed?
- Concurrency: shared state, race conditions, lock ordering, async cancellation.
- Contract changes: does a changed function signature or API update *all*
  callers?
- Resource handling: leaks, unbounded growth, missing cleanup on release.
- Backward compatibility: migrations, wire-format changes, persisted data.

## 5. Testing

- Is there a test for the new behavior? For the bug being fixed (a regression
  test that fails without the fix)?
- Do tests assert real outcomes, or just that code ran?
- Are edge cases and error paths covered, not just the happy path?
- Are existing tests still valid, or were they weakened/skipped to pass?
- Identify what is *not* testable automatically and needs manual verification.

Run the project's checks only if the user asks you to (they write build
artifacts). Detect the toolchain from the repo (e.g. `package.json`, `Cargo.toml`,
`go.mod`, `pyproject.toml`) and use its native commands. Never claim a check
passed if it was skipped or failed.

## 6. Maintainability

- Naming and structure consistent with surrounding code.
- Smallest correct change — no drive-by refactors or formatting noise.
- Dead code, leftover debug output, TODOs without owners.
- Comments explain *why*, not *what*; no stale comments that contradict the code.
- Duplication worth extracting vs. premature abstraction.
- Complexity: deep nesting, long functions, hidden coupling.

## 7. Diff hygiene

Scan the raw diff for anything that should not ship:

- secrets or credentials
- stray debug prints or temporary files
- lockfile churn or hand-edited lockfiles
- generated files edited by hand
- permission/config/signing changes the task did not require
- unrelated changes bundled in

## 8. Output format

Produce a single report in exactly this shape. Order findings by severity.

```text
# Review: <branch / PR / range>

Intent: <one or two sentences on what the change does>

## Blockers
- [SEV] <file:line> — <problem> → <suggested fix>

## Should fix
- [SEV] <file:line> — <problem> → <suggested fix>

## Consider
- [NIT] <file:line> — <problem> → <suggested fix>

## Checked and clean
- <areas verified with no findings: security, correctness, tests, etc.>

## Not run
- <checks skipped and why>

## Verdict
<ship / ship with fixes / block> — <one-line rationale>
```

Rules for the report:

- Every finding cites `file:line` and a concrete fix.
- Severity tags: `SEV` (blocker), `NIT` (minor). No vague "maybe."
- Do not invent findings to seem thorough; an empty section means clean.
- State clearly if you made **no** file changes (the default).

## Adapting to a project

This skill is deliberately generic. To fit a specific repository, adjust:

- The surface classes in step 1 to match the project's structure.
- The toolchain detection and check commands in step 5.
- The platform-surface checks in step 3 (CSP/permissions/signing only apply to
  some stacks).

Replace every `<project-name>` placeholder with the target project's name.