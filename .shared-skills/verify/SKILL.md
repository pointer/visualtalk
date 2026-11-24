---
name: verify
description: Verify a change in <project-name> before claiming it is done. Use when finishing implementation, reviewing a diff, checking a build, running tests, validating config or permission changes, or preparing a release. Detects the project toolchain and runs its native build/test/format checks, then reports what passed, what was skipped, and what needs manual verification.
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

# Verify

Run this before any completion claim for a change in `<project-name>`.

## 1. Identify the changed surface

```bash
git status --short
git diff --stat
```

Classify the change so you only run the checks that apply:

- frontend / UI only
- backend / service only
- frontend + backend contract change
- config, permissions, signing, or bundle change
- docs only
- dependency change

Do not run a full release build unless the task asks for one.

## 2. Detect the toolchain

Do not assume commands. Infer them from the repo:

- `package.json` → Node/pnpm/npm/yarn (use the packageManager field or lockfile)
- `Cargo.toml` → cargo
- `go.mod` → go
- `pyproject.toml` / `requirements.txt` → python (pytest, ruff, etc.)
- `Makefile`, `justfile`, CI config → project-defined targets

Prefer the repository's own scripts (`make`, `just`, CI workflow) over guessing.
State which toolchain you detected and which commands you ran from it.

## 3. Build

Run the project's build step. Examples (use the detected toolchain, not these
literally):

```bash
cargo build            # Rust
pnpm build             # Node
go build ./...         # Go
```

If a dependency or lockfile changed, install and run any license / notices /
audit checks the project defines. Never hand-edit a lockfile.

`dev`/`watch` mode is not a verification step; it does not prove a release build
succeeds.

## 4. Test

```bash
cargo test             # Rust
pnpm test              # Node
go test ./...          # Go
```

- Run the full suite if it is fast; run the targeted subset if it is not.
- If the project has a formatter, run it in check mode (e.g. `cargo fmt --check`,
  `prettier --check`) — do not reformat the whole tree.
- Note any tests skipped and why.

## 5. Diff hygiene

Inspect `git diff` for:

- secrets, API keys, tokens, or private endpoints
- stray debug output (`println!`, `console.log`, `print`), debug flags, temp files
- lockfile churn or hand-edited lockfiles
- generated files edited by hand
- unrelated refactors or formatting noise
- changes to config, permissions, CSP, signing, or capabilities the task did not
  require

Do not read generated files or build artifacts whole (lockfiles, `dist/`,
`node_modules/`, `target/`, `vendor/`).

## 6. Config / permission surfaces

If the change touches permissions, sandboxing, secrets, or platform capabilities,
verify the relevant declarations stay consistent across every file that defines
them (e.g. manifest, entitlement, CSP, capability policy). List any manual
checks the user must perform on a real device or environment that CI cannot.

## 7. Report format

Report only what actually ran:

```text
Changed: <files>
Toolchain: <detected>
Ran: <commands and pass/fail>
Not run: <checks and why>
Diff check: <clean / findings>
Manual checks: <list or none>
Residual risk: <short list>
```

Never claim a check passed if it was skipped or failed.

## Adapting to a project

This skill is deliberately generic. To fit a specific repository, replace every
`<project-name>` placeholder and narrow step 2's detection to that project's
actual toolchains. Add project-specific checks (linters, type checkers, license
gates) where they exist.