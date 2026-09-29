# Changelog

## 0.3.0

- Add Tern Web: Next.js App Router, BYOK Gemini/OpenRouter, local IndexedDB chats and opt-in credential remembering.
- Reuse the existing GTPS retrieval, providers, context, validation and repair engine through `packages/core`.
- Add browser streaming with abort/reset, provider/model selection, Lua attachments/artifacts/downloads, and the 485-entry API Explorer.
- Add request validation, secret redaction, security headers, bounded web requests, and mocked API/browser regression tests.
- Keep CLI commands and credential storage compatible; the CLI version still comes from root package metadata.

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
