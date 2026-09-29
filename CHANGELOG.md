# Changelog

## 0.2.1

### Added

- Provider-aware `/model` and `/models` chat commands, including numbered selection and persistent Gemini model changes without clearing conversation history.
- Safe diagnostics with `--raw --verbose`: status on stderr, final validated Lua on stdout.

### Fixed

- Distinguish upstream HTTP errors, incomplete streams, empty responses, output limits, and blocked responses.
- Recover a buffered, incomplete Gemini stream once through non-streaming generation, without concatenating drafts.
- Explain when forced-provider mode prevents cross-provider fallback.

## 0.2.0

- Added the official Gemini SDK adapter alongside OpenRouter.
- Added multiple credentials per provider, environment discovery, stable local IDs, deduplication, round-robin rotation, and cooldowns.
- Added free-first automatic Gemini-to-OpenRouter fallback and provider configuration.
- Added credential management, local status, provider-aware model commands, and degraded-provider doctor checks.
- Preserved local retrieval of 485 documented GTPS APIs, Lua/API validation, bounded repair, and all original coding workflows.

## 0.1.x

- Initial OpenRouter-based GTPS Lua assistant with local documentation retrieval, chat, generation, fix/review/explain, streaming, validation, and repair.
