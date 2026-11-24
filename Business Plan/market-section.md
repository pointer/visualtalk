# Market

> **Note on figures.** Every number below is a `TODO: verify` placeholder.
> Live market-data sources (web search, Grand View / Mordor / MarketsandMarkets)
> were unreachable while this section was drafted. Do not ship any figure here
> without citing the report, the year, and the page. Directionally correct, not
> citation-ready.

## 1. The market has three layers, and the titans differ by layer

"Video conferencing" is not one market. It is three, and a plan that treats it as
one competes with the wrong titans.

| Layer | What it is | Who dominates | VisualTalk's position |
|---|---|---|---|
| **1. Meeting apps** | End-user apps people join calls with | Microsoft Teams, Zoom, Google Meet, Cisco Webex | Competes here (standalone desktop app) — the hardest layer |
| **2. Embedded / CPaaS** | Video APIs developers embed in *other* apps | Agora, Twilio, Vonage, Daily, **LiveKit** | Built on LiveKit's stack — this is the enabling layer, not the market we sell into |
| **3. Infrastructure** | SFUs / media servers (the plumbing) | LiveKit Cloud, AWS IVS/Chime, Cloudflare Realtime, 100ms, Jitsi | mediacore lets us self-host this layer — the moat |

### Layer 1 — Meeting apps: a bundled-utility game, not a quality game

- **Microsoft Teams** — ~320M MAU (TODO: verify, cite Microsoft earnings). Wins
  by bundling with M365; the enterprise default because it is already installed.
- **Zoom** — the generic noun for "video call"; mindshare, reliability, Zoom
  Rooms hardware. (TODO: verify user/seat figures.)
- **Google Meet** — bundled with Google Workspace and free Gmail accounts;
  near-zero friction for consumers.
- **Cisco Webex** — enterprise/regulatory, government, healthcare; compliance
  certifications and on-prem.

**Reality:** this layer is won by *distribution*, not product quality. Teams and
Meet are attached to suites people already pay for. A standalone app competes
against "free and already on your machine." **Do not try to out-feature them.**

### Layer 1b — Consumer-messaging E2EE titans: the wedge complication

A separate and dangerous category: messaging apps with **default E2EE** that also
do video calls. They occupy the "free + private" position VisualTalk's Pro edition
targets — so the plan must address them head-on, not pretend they don't exist.

- **WhatsApp** (Meta) — ~2B+ users (TODO: verify). E2EE by default (Signal
  protocol) for messages *and* calls; video calling built in. **The single
  biggest reason "true E2EE" alone is not a moat.**
- **Signal** — the E2EE gold standard; video calls; non-profit, privacy-brand.
- **Apple FaceTime** — E2EE, but Apple-to-Apple only (a walled garden, not
  cross-platform).
- **Meta Messenger** — E2EE rolling out; consumer graph.

**Reality:** these titans prove *consumers can have free E2EE video today*.
VisualTalk cannot win the consumer-privacy market against WhatsApp. The wedge
must be **enterprise / self-host / regulated**, where WhatsApp is structurally
disqualified: it is consumer, US-cloud (Meta), not self-hostable, not
admin-controllable, and carries no enterprise compliance or data-residency
guarantees. "True E2EE" is table stakes here — **self-host + admin control +
regulated-vertical compliance is the actual differentiator.**

### Layer 2 — Embedded / CPaaS: fragmented and consolidating

This is the layer the real-time-video titans fight over, and the one our
technology (LiveKit + Rust SFU) comes from:

- **Agora** — public, dominant in embedded real-time video (social, telehealth,
  edtech). (TODO: verify revenue / market share.)
- **Twilio** (Programmable Video) — developer mindshare, broad CPaaS.
- **Vonage** — CPaaS + video, strong in contact center.
- **Daily** — "video for developers," presets.
- **LiveKit** — the open-source challenger; **the stack VisualTalk is built on**;
  powers OpenAI realtime voice and the "bring your own SFU" movement.

**Reality:** "titans" is the wrong frame here — this layer is *fragmented and
still winnable* in a niche. LiveKit is gaining precisely because it is
self-hostable, which is the same wedge our mediacore work gives VisualTalk.

### Layer 3 — Infrastructure: where the moat lives

LiveKit Cloud, AWS IVS/Chime SDK, Cloudflare Realtime, Dolby.io, 100ms, Jitsi
(8x8). This is where mediacore competes. Owning a self-hostable SFU here is what
lets VisualTalk offer "your meetings, your servers, your keys" — something the
Layer 1 titans structurally cannot.

## 2. Market size and growth (TODO: verify every figure)

| Figure | Value | Source to cite |
|---|---|---|
| Global video conferencing market size | `TODO: verify (USD, base year)` | Grand View / Mordor / MarketsandMarkets |
| CAGR (forecast period) | `TODO: verify (directionally low-double-digit %)` | same |
| Enterprise / regulated segment share | `TODO: verify` | segment report |
| Embedded / CPaaS video sub-segment | `TODO: verify` | CPaaS report |

Do not use a market-size number from memory — ours or any AI's. Cite the report
and the year in the business plan's references.

## 3. Where VisualTalk actually sits — and the honest problem

VisualTalk is a **standalone desktop meeting app with a Pro E2EE edition.** That
places it in **Layer 1**, competing with free bundled tools. The plan must answer
three questions head-on:

1. **Who is the customer Teams / Meet / Zoom cannot serve?** A standalone app
   wins only where the titans are *structurally blocked*:
   - **Privacy / sovereignty / E2EE** — Teams and Zoom are US-cloud, subject to
     US law. VisualTalk's Pro E2EE + self-host path targets regulated,
     privacy-first, and non-US buyers. **This is the real wedge.**
   - **Self-hosted / on-prem** — defense, healthcare, government, critical
     infrastructure that cannot use SaaS video.
   - **Regulated verticals** — telehealth, legal, education with specific
     compliance needs (pick one, not "everyone").

2. **Why not Jitsi** (free, self-hosted, E2EE)? Every investor will ask. The
   answer must be Tauri/Rust packaging, product polish, or a specific workflow —
   **not the SFU** (Jitsi already has one).

3. **Why not WhatsApp** (free, E2EE, ~2B users)? Because WhatsApp is consumer,
   US-cloud (Meta), not self-hostable, has no admin controls, and carries no
   enterprise compliance or data-residency guarantees. It is structurally
   disqualified for the regulated/enterprise beachhead. "True E2EE" alone is not
   the moat — **self-host + admin control + vertical compliance is.**

4. **Why not LiveKit Cloud + a UI?** Because the self-host + E2EE Pro path
   (mediacore) is the differentiator. "Just a UI on LiveKit" has no moat.

## 4. Strategic conclusion

**Cede the general market explicitly; claim a defensible slice where US-cloud
bundled tools are disqualified.**

- **Headline:** privacy / sovereignty / E2EE — not a Pro add-on.
- **Proof point:** self-hostable (mediacore makes this real) — "your meetings,
  your servers, your keys."
- **Beachhead:** one regulated vertical (healthcare, legal, government, or
  education) — not horizontal.
- **Don't compete on** "better video calls." That game is lost to distribution.

## 5. Competitive positioning (to quantify in the plan)

| Axis | Teams / Zoom / Meet | WhatsApp / FaceTime | Jitsi | VisualTalk |
|---|---|---|---|---|
| Bundled / free | ✅ (moat) | ✅ (moat) | ✅ (open source) | ❌ (standalone) |
| True E2EE | Partial / add-on | ✅ (consumer) | ✅ | ✅ (Pro) |
| Self-hostable SFU | ❌ | ❌ | ✅ | ✅ (mediacore) |
| Admin / enterprise control | ✅ | ❌ | DIY | ✅ |
| Desktop-native (Tauri/Rust) | ❌ | ❌ | ❌ | ✅ |
| Regulated-vertical focus | Partial | ❌ | DIY | Target |

The right side of this table is the plan's whole argument: we lose the "free and
bundled" row on purpose, and win every row the titans *cannot* follow.

## 6. Open items before this section ships

- [ ] Cite market size, CAGR, and segment shares from a named report + year.
- [ ] Quantify the beachhead vertical (TAM/SAM/SOM) — even a rough bottom-up count.
- [ ] Name 3–5 reference customers or design partners in the target vertical.
- [ ] Validate the "why not Jitsi / LiveKit Cloud" answers with real user interviews.