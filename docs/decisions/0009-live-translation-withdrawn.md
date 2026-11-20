# 0009: Live translation withdrawn

- Date: 2026-11-20
- Status: accepted (supersedes 0003)

## Context

iOS and Android now ship live speech translation at the operating-system level,
so an in-app duplicate competes with the platform instead of adding value. The
in-app side never got past a settings screen: nothing read
`translation.enabled`, there was no audio capture, no provider client and no
caption UI, and the screen stayed hidden behind the `__TRANSLATION_ENABLED__`
completeness flag. Keeping the settings types, commands and store policy of
ADR 0003 alive meant carrying review surface and documentation for a feature
nobody could use.

## Decision

Remove Live Translation from the application for now:

- `Settings → Live Translation` screen and its nav entry;
- `commands/translation.rs` and its two Pro-gated commands;
- the `TranslationSettings` / `TranslationStrategy` types, the `translation`
  settings field and their tests;
- the `__TRANSLATION_ENABLED__` Vite define and `IS_TRANSLATION_AVAILABLE` flag.

Locale strings for translation are left in place (harmless, and they document
the wording if the feature returns with a different design).

## Consequences

- ADR 0003 (translation architecture and store policy) is superseded.
- The translation items in the Pro ship schedule (Phase 2 settings, Phase 3
  audio relay, subtitle overlay) are cancelled until a new decision exists.
- `docs/whisper-service-contract.md` is orphaned; delete or revive it with the
  next translation design.
- Pro loses its planned flagship non-crypto feature; ADR 0008's gates
  (recording, backgrounds, AI assistant) carry the differentiation instead.
