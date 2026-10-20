# VisualTalk Pro — Export-Compliance Packet (DRAFT)

> **Version française :** `docs/export-compliance-pro.fr.md` (translation
> for French counsel / ANSSI-DG Trésor formalities; this English original
> governs in case of divergence — keep both in sync when editing).

> **Status: internal draft for the Pro Edition (E2EE) record.** Not legal
> advice. Items marked **TBD** await the owner's fact sheet; the EAR
> jurisdiction conclusion (§3) and the EU/SBDU position (§4) must be
> confirmed by qualified export-control counsel. The French ANSSI
> declaration is **filed and attested** (2026-10-20, dossier n° 34842510).
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

**Jurisdiction first — likely conclusion: NOT subject to the EAR**
(analysis of 2026-10-20, following receipt of the ANSSI attestation):

- VisualTalk Pro is **French-origin** software, developed and built in
  France by Miradata SASU. Its cryptographic functionality comes solely
  from **published** open-source crates (RustCrypto, public on crates.io).
  Under **15 CFR §734.3(b)(3)**, published software is **not** "subject to
  the EAR"; there is no encryption foreign-direct-product rule reaching a
  French-made product built from published sources; and with no US-origin
  *controlled* content, the de minimis question is moot.
- Consequence if counsel confirms: no ECCN assignment, no License Exception
  ENC reliance, **no BIS self-classification report**, no SNAP-R
  registration — the US filing apparatus does not attach at all. That
  written confirmation is then the sole gate for Apple's NO-declaration
  path (§6).
- **The conclusion is fragile against change**: it breaks if the product
  ever incorporates non-published US-origin crypto components, if
  development/build moves to the US, or if controlled US technology is
  used. Re-run this analysis on any such change (same spirit as the ANSSI
  attestation's "crypto unchanged" clause).

**Fallback if counsel finds the product IS subject to the EAR:**

- Likely classification: **5D002** (information security software),
  mass-market eligibility under **License Exception ENC, §740.17(b)(1)**:
  object code, publicly available standard cryptography, retail, no
  post-shipment support obligations beyond ordinary consumer updates.
  Self-classification yields **ECCN 5D992 / authorization MMKT**.
- Report mechanics — **corrected 2026-10-20** (earlier drafts of this
  packet wrongly described a one-time pre-release filing to
  `bisencryption@bis.doc.gov`): per **Supplement No. 8 to Part 742**, the
  mass-market self-classification report is a **CSV emailed to
  `crypt-supp8@bis.doc.gov` and `enc@nsa.gov`**, submitted **annually by
  February 1** covering the preceding calendar year. It is
  **retrospective — NOT a pre-release gate**: a Dec-2026 launch would make
  the first report due 2027-02-01. Verify addresses/format against current
  BIS guidance at filing time.
- Pre-drafted artifacts, **on HOLD / do-not-send** until counsel lifts the
  hold (gitignored, PII-dense): `docs/bis-self-classification-report.csv`
  and `docs/bis-self-classification-email.md` (send conditions documented
  in the email draft).
- Sanctions screening: standard OFAC compliance applies to store
  distribution (platforms handle territory availability). **TBD:** confirm
  no additional direct-distribution channels.

## 4. French / EU dual-use

- **French declaration: DONE.** The ANSSI cryptology declaration was filed
  on 2026-10-20 and ANSSI issued the deposit **attestation — dossier
  n° 34842510, dated 2026-10-20** (PDF:
  `~/Downloads/attestation-dossier-34842510.pdf`; archive to `~/Backups/`
  and off-machine). The French "fourniture en France" obligation is
  discharged. Caveat: future versions stay covered **only while the
  cryptologic characteristics are unchanged** — any change to the crypto
  stack requires a new declaration before distribution (rule recorded in
  `src-tauri/e2ee-pro/README` and `docs/anssi-declaration-visualtalk-pro.md`).
- **EU dual-use export — the remaining French/EU item.** The attestation
  explicitly points extra-EU distribution to the **SBDU** (Service des
  biens à double usage, DG Trésor) under **EU Regulation 2021/821**,
  Category 5 Part 2. **TBD (counsel):** whether worldwide store
  distribution of this mass-market crypto software requires any SBDU
  formality/authorization or is covered by the general software note /
  mass-market treatment. This — not the BIS side (§3) — is the live
  pre-release filing question.
- First-release date and distribution territory list (owner decision,
  2026-10-19): **worldwide simultaneous release** in all store territories,
  targeting the **week after App Review approval** — as soon as possible
  (Phase 3 of the ship calendar targets submission in the Dec 2026 window).
  Sequencing rule: any required French/EU filing must be complete **before**
  that first-availability date; the release is gated on it, not the reverse.

## 5. Mainland China and restricted territories

**Mainland China — EXCLUDE from initial availability (recommended; owner to
confirm).** A China launch is a separate legal project, not a checkbox:

- **PRC Cryptography Law** (effective 2020-01-01) and the revised
  **Commercial Cryptography Regulations** (effective 2023-07-01): commercial
  cryptography products are subject to OSCCA certification/type-approval
  regimes, and import/export of commercial cryptography items is
  list-controlled. Applicability to a foreign mass-market E2EE consumer app
  is untested, and E2EE messaging services (WhatsApp, Signal) are
  effectively blocked in China.
- **Apple's mainland China storefront requires an ICP filing** (MIIT) for
  every app since Oct 2023 — which in turn requires a Chinese legal entity
  and domestic hosting. Neither exists for a bring-your-own-server app like
  VisualTalk, so the China storefront is not reachable on this timeline.
- **Google Play is unavailable in mainland China**; Android distribution
  would run through local stores with their own filing/certification
  requirements.
- **PIPL** (data protection) and data-localization duties would attach to
  any China-facing operation.

Decision path: deselect mainland China in App Store Connect territory
availability at submission. Revisit only with dedicated PRC counsel and a
business case (local entity, ICP, OSCCA certification, PIPL program).

**Russia / Belarus:** since 2022 BIS has restricted License Exception ENC
availability for many encryption items to Russia/Belarus; platform-mediated
consumer distribution sits in a gray zone. **TBD (counsel):** confirm
whether to deselect these territories at initial release — recommended yes.

**Embargoed destinations** (Cuba, Iran, North Korea, Syria, and the covered
Ukrainian regions): blocked by the store platforms themselves; no action
beyond never circumventing platform territory controls.

## 6. App Store Connect — encryption answers (Pro record)

Current build declaration (set in `src-tauri/Info-pro.plist`):
`ITSAppUsesNonExemptEncryption = YES` — the **conservative** posture
(owner decision 2026-10-19, reverting the same-day flip to NO). Rationale:
the key asserts a legal position. YES is always truthful and never blocks
approval — it only adds questionnaire friction. NO is an exemption *claim*
that must be backed by counsel's written classification opinion, which does
not exist yet.

ASC questionnaire (App Encryption Declaration) while YES:
1. "Does your app use encryption?" → **Yes.**
2. "Is it limited to exempt uses?" → **No** while YES is the declared
   posture.
3. "Does it use proprietary or non-standard encryption?" → **No** (standard
   algorithms only, per §2).

Path to flipping to **NO** before submission (fastest review) — requires
**one** artifact (updated 2026-10-20):
1. Counsel confirms **in writing** either (a) the product is **not subject
   to the EAR** (the §3 jurisdiction conclusion — the expected outcome for
   French-origin software built from published open-source crypto), or
   (b) mass-market/exempt eligibility (Note to Category 5 Part 2 /
   5D992-type treatment).

   *The former second gate — "the one-time BIS self-classification report
   is filed" — is REMOVED: per §3 that report is retrospective, applies
   only if the product is subject to the EAR at all, and never gates
   release or the Apple declaration.*

Then set `Info-pro.plist` to NO, answer Q2 "Yes — exempt mass-market",
and rebuild. **Do not flip without counsel's written confirmation.** If
submission arrives before counsel sign-off, submit with YES — it is
shippable as-is.

Community Edition record: keep `ITSAppUsesNonExemptEncryption = NO` — the CE
binary contains no custom crypto; transport security comes from platform
TLS/DTLS (Apple exemption: limited to OS encryption / exempt usage).

## 7. Owner fact sheet — inputs still required (TBD)

- [x] Planned first-availability date (owner, 2026-10-19): worldwide
      simultaneous release, week after App Review approval — as soon as
      possible (submission targeted in the Dec 2026 Phase 3 window),
      **subject to the territory exclusions in §5** (mainland China
      recommended excluded; Russia/Belarus TBD via counsel). Hard
      gate: the French filing is **complete** (ANSSI attestation, dossier
      n° 34842510, 2026-10-20); the remaining gates before first
      availability in ANY territory are counsel confirmation of the EAR
      position (§3) and of the EU/SBDU position (§4).
- [x] ANSSI cryptology declaration filed and **attestation received**
      (dossier n° 34842510, dated 2026-10-20). Covers future versions only
      while cryptologic characteristics are unchanged; extra-EU
      distribution referred to the SBDU (§4). Owner to-do: archive the
      attestation PDF to `~/Backups/` and off-machine.
- [ ] Territory exclusions confirmed at submission: deselect mainland
      China in ASC availability (§5 recommendation — owner to confirm);
      Russia/Belarus decision from counsel.
- [x] Confirmation that RustCrypto crates are the only cryptographic
      components in the Pro binary (spot-checked via `cargo tree`, see §2;
      `ring` present only as transitive TLS).
- [ ] Annual units/revenue expectations (some reports ask; platforms also
      provide sales data).
- [ ] Counsel engagement for: EAR jurisdiction confirmation (§3), EU/SBDU
      export position (§4), and the Apple NO-declaration flip (§6). The
      French declaration is already filed and attested; BIS
      self-classification artifacts are drafted and on HOLD (§3) pending
      counsel's jurisdiction call. Ready-to-send draft emails (FR + EN)
      with the fixed-fee scope, screening questions, end-Nov deadline and a
      sending checklist: `docs/counsel-engagement-email.md` (scope updated
      2026-10-20). First contacts: CCI / Team France Export advisory desk,
      then 2–3 export-control firms.
- [x] Decision point keep `YES` vs flip to `NO`: **YES for now** (owner,
      2026-10-19, reverting the same-day NO). Flip to NO before submission
      only with counsel's written confirmation in hand (path in §6);
      otherwise submit with YES.

## 8. References

- 15 CFR §734.3(b)(3) (published software not subject to the EAR), §740.17
  (License Exception ENC, mass market), §742.15, Supplement No. 8 to Part
  742 (mass-market self-classification report), Supp. 1 to Part 740.
- EU Regulation 2021/821 (dual use), Category 5 Part 2.
- Apple: "Export Compliance — App Encryption Declaration" developer docs.
- This repo: `src-tauri/e2ee-pro/e2ee.rs` (private, gitignored),
  `src-tauri/Info-pro.plist`, `src-tauri/tauri.pro.conf.json`,
  `EULA-PRO` §8 (export compliance clause shown to users).