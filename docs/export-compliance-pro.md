# VisualTalk Pro — Export-Compliance Packet (DRAFT)

> **Status: internal draft for the Pro Edition (E2EE) record.** Not legal
> advice. Items marked **TBD** await the owner's fact sheet; the BIS
> self-classification and any French/EU dual-use filing must be reviewed by
> qualified export-control counsel before submission.
>
> Scope: VisualTalk **Pro Edition** only (`com.katebg.visualtalk.pro`). The
> Community Edition ships **no** proprietary cryptographic implementation
> (E2EE is a compile-time stub), so its store records declare no non-exempt
> encryption usage.

## 1. Product summary

- Product: VisualTalk Pro — bring-your-own-server video-conferencing desktop
  and mobile application (Tauri v2; Rust backend, web frontend).
- Publisher: Miradata SASU, RCS Bobigny 849 735 311, VAT FR64849735311,
  12 rue Jacques Catric, 93260 Les Lilas, France.
- Cryptographic function: **end-to-end encryption of user chat messages and
  file transfers** between meeting participants. Audio/video is transported
  by the customer-operated LiveKit server using standard WebRTC
  DTLS-SRTP/TLS — no custom cryptographic module is involved.
- Distribution: mass market, retail, via Apple App Store / Google Play
  (object code only; no source of the Pro E2EE module is distributed).
- Encryption is **not** used for DRM, general-purpose computing, or covert
  storage beyond the user-visible E2EE feature.

## 2. Cryptographic description (facts from the shipped code)

| Function | Algorithm | Parameters | Standard | Implementation (version) |
|---|---|---|---|---|
| Key agreement | ECDH | NIST P-256 (256-bit) | SP 800-56A | RustCrypto `p256` 0.14, pure Rust |
| Key derivation | HKDF | SHA-256, info `visualtalk-e2ee-v1` | RFC 5869 | manual HMAC-SHA256 over `sha2` 0.11 |
| Hash / MAC | SHA-256, HMAC-SHA256 | 256-bit digest | FIPS 180-4, RFC 2104 | RustCrypto `sha2` 0.11 |
| Content encryption | AES-256-GCM | 256-bit key, 96-bit IV, 128-bit tag | FIPS 197, SP 800-38D | RustCrypto `aes-gcm` 0.11.1 |
| Random generation | CSPRNG | OS-entropy seeded | — | RustCrypto `rand` 0.10 |
| Transport (not custom) | TLS 1.2/1.3, DTLS-SRTP | per platform / LiveKit | IETF | platform & library defaults |

Notes for the classification narrative:
- All algorithms are **standard, publicly documented** NIST/IETF primitives;
  there is **no proprietary or non-standard cryptographic algorithm**.
- Implementation is pure Rust from publicly available open-source crates
  (RustCrypto). No FIPS 140-validated module is used or claimed.
- The E2EE feature is compile-time gated (`--features e2ee`); the Community
  Edition binary contains no cipher implementation.
- `cargo tree --features e2ee` spot-check (2026-10-19): `p256` and `aes-gcm`
  are direct dependencies of the app only; all other crypto crates in the
  graph are standard RustCrypto components (aes, ghash, hmac, hkdf, sha2,
  rand/rand_chacha). `ring` appears solely as a transitive TLS dependency
  (rustls via the LiveKit stack) — transport security, not custom crypto.

## 3. US EAR analysis (draft — counsel to confirm)

- Likely ECCN: **5D002** (information security software), mass-market
  eligibility under **License Exception ENC, §740.17(b)(1)**: object code,
  publicly available standard cryptography, retail, no post-shipment support
  obligations beyond ordinary consumer updates.
- Required step: **one-time self-classification report** to BIS
  (bisencryption@bis.doc.gov per current BIS guidance) when relying on
  §740.17 mass-market for 5D002; keep the report and any BIS response on
  file. **TBD:** confirm current submission address/format at filing time.
- US-origin content: the cryptographic code is publicly available US-origin
  open source (RustCrypto). **TBD:** de minimis / "publicly available"
  analysis for the assembled product, per counsel.
- Sanctions screening: standard OFAC compliance applies to store
  distribution (platforms handle territory availability). **TBD:** confirm
  no additional direct-distribution channels.

## 4. French / EU dual-use (draft — counsel to confirm)

- EU Regulation **2021/821**, Category 5 Part 2 (5A002/5D002 equivalents).
- Mass-market / "publicly available" cryptography software generally follows
  the French national procedure (declaration to the ANSSI / DG Trésor via
  the Cerfa process for crypto means). **TBD:** confirm whether the
  general software declaration or an exemption applies; file before first
  distribution if required.
- First-release date and distribution territory list (owner decision,
  2026-10-19): **worldwide simultaneous release** in all store territories,
  targeting the **week after App Review approval** — as soon as possible
  (Phase 3 of the ship calendar targets submission in the Dec 2026 window).
  Sequencing rule: any required French/EU filing must be complete **before**
  that first-availability date; the release is gated on it, not the reverse.

## 5. App Store Connect — encryption answers (Pro record)

Current build declaration (set in `src-tauri/Info-pro.plist`):
`ITSAppUsesNonExemptEncryption = YES` — the **conservative** choice while
the classifications above are pending.

ASC questionnaire (App Encryption Declaration), recommended answers:
1. "Does your app use encryption?" → **Yes.**
2. "Is it limited to exempt uses?" (Apple OS encryption / authentication /
   DRM / exempt mass-market per 5D992 notes) → **No** while
   `ITSAppUsesNonExemptEncryption = YES` is the declared posture.
3. "Does it use proprietary or non-standard encryption?" → **No** (standard
   algorithms only, per §2).

Path to flipping the declaration to **NO** (exempt): after the BIS
self-classification report is filed and counsel confirms mass-market
eligibility (encryption limited to exempt uses under the Note to Category
5 Part 2 / 5D992 treatment), set `ITSAppUsesNonExemptEncryption = NO` in
`Info-pro.plist` and answer the questionnaire accordingly. **Do not flip
before counsel sign-off.**

Community Edition record: keep `ITSAppUsesNonExemptEncryption = NO` — the CE
binary contains no custom crypto; transport security comes from platform
TLS/DTLS (Apple exemption: limited to OS encryption / exempt usage).

## 6. Owner fact sheet — inputs still required (TBD)

- [x] Planned first-availability date (owner, 2026-10-19): worldwide
      simultaneous release, week after App Review approval — as soon as
      possible (submission targeted in the Dec 2026 Phase 3 window). Hard
      gate: BIS self-classification and French/EU filing (or confirmed
      exemption) complete before first availability in ANY territory.
- [x] Confirmation that RustCrypto crates are the only cryptographic
      components in the Pro binary (spot-checked via `cargo tree`, see §2;
      `ring` present only as transitive TLS).
- [ ] Annual units/revenue expectations (some reports ask; platforms also
      provide sales data).
- [ ] Counsel engagement for BIS self-classification + French declaration.
      Ready-to-send draft emails (FR + EN) with the fixed-fee scope,
      screening questions, end-Nov deadline and a sending checklist:
      `docs/counsel-engagement-email.md`. First contacts: CCI /
      Team France Export advisory desk, then 2–3 export-control firms.
- [ ] Decision point: keep `YES` at submission (slower review, safer) vs.
      flip to `NO` with exemption basis (faster, needs paperwork first).

## 7. References

- 15 CFR §740.17 (License Exception ENC, mass market), §742.15, Supp. 1 to
  Part 740.
- EU Regulation 2021/821 (dual use), Category 5 Part 2.
- Apple: "Export Compliance — App Encryption Declaration" developer docs.
- This repo: `src-tauri/e2ee-pro/e2ee.rs` (private, gitignored),
  `src-tauri/Info-pro.plist`, `src-tauri/tauri.pro.conf.json`,
  `EULA-PRO` §8 (export compliance clause shown to users).