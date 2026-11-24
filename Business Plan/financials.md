# Financials

> Companion sections: [Executive Summary](executive-summary.md) ·
> [Market](market-section.md) · [Product](product.md) ·
> [Go-to-Market](go-to-market.md)
>
> **Every figure is a `TODO: verify` / `TODO: model` placeholder.** No number
> here is real yet. Fill from cited sources and a bottom-up model before this
> section is shown to anyone.

## Revenue model (TODO: decide + model)

| Stream | Unit | Price | Notes |
|---|---|---|---|
| Pro subscription | per-seat / per-org (`TODO`) | `TODO` | E2EE, recording, backgrounds, AI |
| Self-hosted enterprise | license + support | `TODO` | mediacore on-prem |
| Services (optional) | deployment / compliance | `TODO` | Self-host setup, vertical compliance |

## Cost structure

| Category | Driver | Estimate |
|---|---|---|
| Infrastructure | LiveKit Cloud minutes or self-hosted SFU hosting | `TODO` |
| mediacore / self-host ops | nodes, coturn, S3 (recordings), Postgres | `TODO` |
| Compliance | beachhead certification + audits | `TODO` |
| R&D | engineering headcount | `TODO` |
| S&M | CAC, sales capacity | `TODO` |
| G&A | legal, finance, admin | `TODO` |

**Recording cost note:** mediacore records **audio-only Ogg to S3** (small —
"Opus is a few megabytes an hour"). Video recording, when it lands, grows storage
"one or two orders of magnitude" (mediacore roadmap). Model storage accordingly.

## Unit economics (TODO: model)

- **CAC** — `TODO` (by channel: direct, self-serve, reseller).
- **LTV** — `TODO` (ARPA × gross margin × retention).
- **LTV:CAC** target — `TODO` (rule of thumb ≥ 3:1).
- **Gross margin** — `TODO` (infra + support COGS vs. subscription price).
- **Payback period** — `TODO` (months).

## Projections (TODO: build the model)

| Year | Customers | ARR | COGS | Gross margin | OpEx | EBITDA |
|---|---|---|---|---|---|---|
| Y1 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |
| Y2 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |
| Y3 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |

Build this **bottom-up**: beachhead-vertical account count × ACV × attach rate,
then expand. Do not top-down from a market-size figure.

## Funding (TODO: fill in)

- **Sought:** `TODO`
- **Use of funds:** `TODO` (R&D / S&M / compliance split)
- **Milestones unlocked:** `TODO`
- **Runway:** `TODO` (months)
- **Team:** `TODO` (roles, not just headcount)

## Key assumptions to validate

- [ ] Pro price point and unit (seat vs. org).
- [ ] Beachhead vertical ACV and sales-cycle length.
- [ ] Infra cost per meeting-hour (LiveKit Cloud vs. self-hosted mediacore).
- [ ] Compliance cost + timeline (gates paid expansion).
- [ ] Retention / churn in the beachhead vertical.
- [ ] mediacore TCO vs. LiveKit Cloud at target scale (the make-vs-buy call).

## Open financial questions

- [ ] Self-hosted enterprise: license-only vs. license+support+services?
- [ ] Does Community Edition cannibalize Pro, or feed it? (model both)
- [ ] Recording storage cost model once mediacore video lands.