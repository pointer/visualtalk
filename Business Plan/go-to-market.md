# Go-to-Market

> Companion sections: [Executive Summary](executive-summary.md) ·
> [Market](market-section.md) · [Product](product.md) · [Financials](financials.md)
>
> Every figure is a `TODO: verify` / `TODO: decide` placeholder.

## Strategy in one line

**Cede the general market; own a regulated vertical where US-cloud bundled tools
are structurally disqualified — then expand.**

## Beachhead (TODO: choose one)

Pick one regulated vertical and win it before going horizontal:

| Vertical | Why it fits | Compliance to prioritize |
|---|---|---|
| Healthcare / telehealth | E2EE, on-prem, patient data | HIPAA / GDPR health data |
| Legal | Privilege, confidentiality, retention | Bar / client-confidentiality rules |
| Government / defense | Sovereignty, air-gap, on-prem | FedRAMP / national equivalents |
| Education | Student privacy, district self-host | FERPA / GDPR minors |

`TODO: choose, name TAM/SAM/SOM, name 3–5 design partners.`

## Positioning

- **Headline:** private, **self-hostable** video with admin control and true E2EE —
  built for regulated organizations, not consumers.
- **Proof:** "your meetings, your servers, your keys."
- **Anti-position:** not a cheaper Zoom; not "free and bundled." Explicitly
  cede the general SMB/consumer market — **and the consumer-E2EE market, which
  WhatsApp / Signal / FaceTime already own for free.** We do not compete on
  "private video calls"; E2EE is table stakes. We compete on self-host + admin
  control + vertical compliance, where consumer apps are disqualified.

## Channels

| Channel | Fit | Notes |
|---|---|---|
| Direct enterprise sales | High (ACV) | For the beachhead vertical; longer cycle |
| Self-serve Community → Pro | Medium | Bottom-of-funnel adoption |
| Self-hosted enterprise license | High | mediacore on-prem deals |
| Channel / resellers | Medium | Vertical SIs, MSPs |
| Open-source community | Low/Medium | Community Edition credibility, not monetization |

## Pricing (TODO: validate)

- **Community** — free, noncommercial (adoption).
- **Pro** — per-seat or per-org (**TODO: decide**); E2EE, recording, backgrounds, AI.
- **Self-hosted enterprise** — license + support (**TODO: decide** structure).

`TODO: competitor price anchors (Zoom, Teams E5, Jitsi/8x8, LiveKit Cloud).`

## Motion

1. **Design partners** in the beachhead vertical (3–5), free or discounted, in
   exchange for case studies and compliance feedback.
2. **Compliance milestone** — achieve the beachhead's certification (TODO: which)
   as the gate to paid expansion.
3. **Reference customers** → case studies → lookalike accounts in the vertical.
4. **Horizontal expansion** only after beachhead dominance.

## Competition (summary)

See [Market](market-section.md) §5. We lose "free and bundled" on purpose; we win
E2EE, self-host, desktop-native, and vertical-focus — the rows the titans cannot
follow.

## Risks

- **"Why not WhatsApp (free, E2EE, ~2B users)?"** — answer: consumer, US-cloud
  (Meta), not self-hostable, no admin controls, no enterprise compliance or
  data-residency. Structurally disqualified for the regulated/enterprise
  beachhead. E2EE alone is not the moat.
- **"Why not Jitsi (free, self-hosted, E2EE)?"** — answer: Tauri/Rust packaging,
  product polish, vertical workflow, admin control, support. **Not** the SFU.
- **"Why not LiveKit Cloud + a UI?"** — answer: self-host + E2EE Pro is the moat.
- **mediacore immaturity** — video recording, TURN, resume are roadmap
  dependencies; mobile may need LiveKit until they land.
- **Titan bundling / consumer E2EE** — if WhatsApp or Teams/Meet ship true E2EE +
  self-host + admin control for organizations, the wedge erodes. Speed to
  beachhead dominance matters.

## Open GTM questions

- [ ] Beachhead vertical + its compliance regime.
- [ ] Pricing model + price points.
- [ ] Design-partner pipeline (names).
- [ ] Sales capacity / CAC assumptions (feeds [Financials](financials.md)).