---
name: e2ee-review
description: Audit VisualTalk Pro end-to-end encryption for chat and file transfer. Use when reviewing or changing src-tauri/src/e2ee.rs, chat.rs, src/components/ChatPanel.jsx, src/components/chat.jsx, key exchange, encrypted files, the Pro edition, or any claim that a path is end-to-end encrypted.
---

# VisualTalk E2EE Review

Use this skill for Pro/E2EE design review, code review, bug triage, and pre-release audits.

Stay read-only unless the user explicitly asks for a fix. Produce findings, not a rewrite.

## Scope

Primary locations:

- `src-tauri/src/e2ee.rs` (crypto core)
- `src-tauri/src/chat.rs` (transport and message plumbing)
- `src/components/chat.jsx` (send/receive wiring)
- `src/components/ChatPanel.jsx` (rendering, file assembly, consent UI)
- `src/lib/` (room/session wiring)
- `src-tauri/src/session.rs`, `window.rs` (session lifecycle and window isolation)

The private `src-tauri/e2ee-pro/` sources are not in a fresh clone. Do not assume they exist.

## Checklist

For each item, cite the current file and symbol. If current code has already changed, verify before repeating a historical finding.

1. Key authenticity
   - Public keys arrive in-band over `vt-e2ee`.
   - Are keys authenticated by fingerprint, signature, or a safety number before use?
   - Without authentication, ECDH is MITM-able. Demand a concrete trust mechanism, not a UI warning.

2. Key rollback
   - Does importing a peer key overwrite an existing key for the same identity?
   - Can a replayed old key message roll a peer back?
   - Expect first-use pinning or explicit key-change approval.

3. Sender binding
   - The ciphertext contains a sender field. Is it checked against the outer transport sender used for key selection?
   - If not, a modified client can impersonate another participant or bypass a local block list.

4. Metadata leakage
   - The SFU still sees sender identity, display name, timestamp, message ID, file name, size, chunk count, and timing.
   - Do not describe the path as fully private when only content is protected.

5. Forward secrecy
   - One ephemeral keypair per meeting with no ratchet means no per-message forward secrecy.
   - Check whether session destruction actually separates meetings and wipes state.

6. Replay protection
   - Are message IDs or nonces tracked?
   - Can a captured payload be replayed and rendered again?
   - Expect a seen-message set or monotonic counter per sender/session.

7. File integrity
   - Are `file_id` and chunk sequence inside the GCM-authenticated data or AAD?
   - Can chunks be reordered or omitted without detection?
   - Is there a whole-file hash?
   - Does the receiver verify that every chunk arrived before saving and marking the file complete?

8. Key lifecycle
   - Are peer keys removed when a participant leaves?
   - Can a message be sent with an empty `wrappedKeys` map and still show as encrypted?
   - Is `file_keys` keyed by sender as well as `file_id`?
   - Is the E2EE session global across windows? Two meeting windows must not replace or destroy each other's keys.

9. Fail-closed behavior
   - If encryption throws, does the app send plaintext?
   - If decryption fails, does the UI fall through to raw ciphertext?
   - E2EE claims must not survive a fail-open path. Require an explicit user-visible failure and no silent downgrade.

10. Sender experience
    - Does the sender's own encrypted bubble render text, or only the ciphertext envelope?
    - A frontend/contract mismatch here is user-visible even when crypto is correct.

11. Zeroization
    - Are session keys and ephemeral private keys explicitly wiped when destroyed?
    - Do not assume crate drop behavior; check for `zeroize` or equivalent.

## Severity

- `critical`: confidentiality or authenticity is broken, or plaintext is sent while E2EE is claimed.
- `high`: replay, key rollback, impersonation, chunk reordering, or cross-window key destruction.
- `medium`: metadata leakage, missing completeness checks, sender UI gaps, stale keys.
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

- a one-paragraph verdict on whether the "end-to-end encrypted" claim is accurate for chat and for files
- what could not be verified because the Pro sources are absent
- the top three fixes in priority order

## Guardrails

- Do not weaken crypto, disable checks, or hide warnings to make tests pass.
- Do not claim E2EE from a UI label, a boolean, or a code comment.
- Do not propose a rewrite when a narrow protocol fix is enough.
- Do not edit files unless the user asks for implementation after the review.
