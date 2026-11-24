---
name: security-review
description: Audit a security-sensitive change in <project-name> before it ships. Use when reviewing or changing authentication, encryption, key management, session handling, secret storage, authorization, or any claim that a path is secure or end-to-end encrypted. Focuses on key authenticity, replay, downgrade/fail-open paths, and data exposure. Read-only by default: reports findings, never edits files unless explicitly told to.
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

# Security Review

Use this skill for security-sensitive design review, code review, bug triage, and
pre-release audits of `<project-name>`.

Stay read-only unless the user explicitly asks for a fix. Produce findings, not a
rewrite.

## Scope

Adapt the file list to the project. Typical security-sensitive surfaces:

- authentication and session modules
- encryption / crypto core and key management
- token minting and verification
- transport and message plumbing
- secret storage (keychain, vault, env handling)
- authorization / access control paths

Do not assume any particular file exists until you locate it with a search.

## Checklist

For each item, cite the current file and symbol. If the code has already changed,
verify before repeating a historical finding.

1. Key / credential authenticity
   - Are public keys or credentials obtained in-band over the transport?
   - Are they authenticated by fingerprint, signature, or a safety number before
     use?
   - Without authentication, key exchange is MITM-able. Demand a concrete trust
     mechanism, not a UI warning.

2. Rollback / replay of key material
   - Does importing or rotating a key overwrite an existing one for the same
     identity?
   - Can a replayed old key message roll a peer back?
   - Expect first-use pinning or explicit change approval.

3. Sender / origin binding
   - If a message or request carries a sender field, is it checked against the
     outer transport identity used for key selection or authorization?
   - If not, a modified client can impersonate another party or bypass a block
     list.

4. Metadata leakage
   - What does the transport or server still see (identity, timestamp, sizes,
     counts, timing) even when content is protected?
   - Do not describe a path as fully private when only content is protected.

5. Forward secrecy
   - Is there an ephemeral key per session with no ratchet? That means no
     per-message forward secrecy.
   - Check whether session destruction actually separates sessions and wipes
     state.

6. Replay protection
   - Are message IDs or nonces tracked?
   - Can a captured payload be replayed and processed again?
   - Expect a seen-message set or monotonic counter per sender/session.

7. Integrity of multi-part data (files, chunks, streams)
   - Are identifiers and sequence numbers inside the authenticated data or AAD?
   - Can parts be reordered, omitted, or truncated without detection?
   - Is there a whole-message / whole-file hash?
   - Does the receiver verify completeness before saving or marking complete?

8. Key / secret lifecycle
   - Are secrets removed when a session ends or a party leaves?
   - Can an operation proceed with an empty key set and still report success?
   - Is session state global across contexts that must be isolated?

9. Fail-closed behavior (the critical one)
   - If encryption or authorization throws, does the code fall back to plaintext
     or an open path?
   - If verification fails, does the caller proceed anyway?
   - Security claims must not survive a fail-open path. Require an explicit,
     user-visible failure and no silent downgrade.

10. Caller / sender experience
    - Does the acting user see a truthful result (e.g. real content, not just an
      envelope or error)?
    - A frontend/contract mismatch here is user-visible even when the crypto or
      authz is correct.

11. Zeroization
    - Are session keys and ephemeral private keys explicitly wiped when
      destroyed?
    - Do not assume runtime drop behavior; check for an explicit zeroize or
      equivalent.

## Severity

- `critical`: confidentiality or authenticity is broken, or a fallback sends
  plaintext / grants access while security is claimed.
- `high`: replay, key rollback, impersonation, reordering, or cross-context key
  destruction.
- `medium`: metadata leakage, missing completeness checks, caller-experience gaps,
  stale secrets.
- `low`: hardening and defense-in-depth.

## Output format

For each finding:

```text
[severity] <title>
Where: <file>:<symbol or line>
Issue: <what is wrong>
Impact: <attacker or user consequence>
Evidence: <code path that proves it>
Fix: <smallest correct change>
Test: <regression test to add>
```

End with:

- a one-paragraph verdict on whether the security claim (e.g. "end-to-end
  encrypted", "access-controlled") is accurate for each path reviewed
- what could not be verified and why
- the top three fixes in priority order

## Guardrails

- Do not weaken crypto or authz, disable checks, or hide warnings to make tests
  pass.
- Do not claim security from a UI label, a boolean, or a code comment.
- Do not propose a rewrite when a narrow fix is enough.
- Do not edit files unless the user asks for implementation after the review.

## Adapting to a project

Replace every `<project-name>` placeholder and retarget the scope list to the
project's actual security-sensitive modules. The checklist is general; keep the
items that apply and drop those that do not.