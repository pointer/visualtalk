# Decisions

Durable project decisions for VisualTalk. This is the short record of why the repo is
shaped the way it is, so a new session does not re-open settled questions.

## When to add one

- A rule in `AGENTS.md` or `Guidance.md` changes.
- A dependency, tool, or external service is added for a non-obvious reason.
- A security, permission, licensing, or platform assumption changes.
- A previous decision is reversed.

## Format

One file per decision: `NNNN-short-title.md`.

```text
# NNNN: Title

- Date: YYYY-MM-DD
- Status: accepted | superseded by NNNN

## Context
What forced the decision.

## Decision
What we chose.

## Consequences
What follows, including what we deliberately gave up.
```

Keep entries short. Link the PR or commit when there is one. Do not edit an accepted
decision to change its meaning; add a new one that supersedes it.
