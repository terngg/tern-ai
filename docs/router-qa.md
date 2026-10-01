# Router QA and provider evidence

Tern AI remains the product. TernRouter reference commit: `a46bd7eaa0989929afeb39b4979c0d6bcb8233e3`.

## Provider matrix

“Implemented” means code and contract tests exist. It does not mean a paid/live account successfully generated a response. Models depend on the credential's catalog and permissions. Every implemented adapter currently supports text chat, not tools, vision, embeddings or images.

| Provider | Auth | Models | Streaming | Multi-account | Vercel | Live inference tested | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Codex CLI | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Copilot | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Cursor | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Gemini CLI | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Kiro | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Qwen Code | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Cline | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Antigravity | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| Kilo Code | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |
| OpenAI | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Gemini | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Anthropic | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| OpenRouter | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Groq | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| DeepSeek | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Mistral | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Together AI | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Fireworks AI | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Cerebras | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| xAI | api_key | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| OpenAI Compatible | custom | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Anthropic Compatible | custom | Discovery + configured IDs | Yes | Yes | Yes | No | IMPLEMENTED + NOT TESTED (credentials unavailable) |
| Custom REST | custom | — | — | — | No | No | UNSUPPORTED |
| Ollama | local_companion | — | — | — | No | No | REQUIRES LOCAL COMPANION |

## Counts

- Providers displayed: 25
- Implemented adapters: 13 (11 named APIs and 2 compatible protocols)
- Providers fully runtime verified with real authorized inference: 0
- Implemented adapters awaiting valid credentials: 13
- Requires Tern Companion: 11
- Unsupported: 1 (Custom REST has no request mapping)
- Fake/mock provider behavior remaining in production: 0

## Verification

- Unit/integration suite: 94 passing, including the existing CLI and GTPS tests.
- Router suite includes AES-GCM integrity/AAD, PostgreSQL isolation, durable cursor and cooldown claims, authentication/revocation/CSRF, error classification, 13 provider protocol contracts, a real local OpenAI-compatible HTTP fixture, SSE framing, split-secret redaction, bounded fallback, cancellation and GTPS repair.
- PostgreSQL semantics are tested using PGlite in tests only. Production uses managed Neon PostgreSQL; there is no embedded/local production fallback.
- Browser suite: 7 passing (desktop/mobile catalog, truthful empty states, history, attachment/download, XSS, cancellation/truncation and legacy-key removal). AI replies in these browser tests are fixtures, not live provider verification.
- Official model endpoints were contacted with intentionally invalid credentials: OpenAI, Anthropic, Groq, DeepSeek, Mistral, Together, Fireworks and Cerebras returned 401. Gemini/xAI returned documented invalid-key errors with HTTP 400. OpenRouter's public catalog returned 200, so its implementation separately checks authenticated /key. These are negative tests only.
- Lint, root/web typecheck and CLI/Next production build pass. Initial Vercel preview identified missing workspace-local @types/pg; fixed before rollout.
- Managed Neon free database provisioned in iad1; migration 001-router.sql applied. Seven tables, encryption roundtrip, metadata redaction and routing cursor verified against managed PostgreSQL.
- Deployed preview verification (`https://tern-jkx2hdrvs-terngg.vercel.app`):
  - `scripts/check-web-deployment.mjs`: PASS public homepage and security headers (CSP, nosniff, frame-ancestors none), serverless GTPS reference (485 entries), all router entrypoints require authenticated user (no credential/user-ID bypass), cross-origin request protection (403 on untrusted origin), simulated testing endpoint retired (410 Gone).
  - `scripts/verify-router-deployment.mjs`: PASS managed PostgreSQL connectivity and seven router tables, AES-256-GCM encrypted persistence, authenticated roundtrip with AAD, metadata-only response, cross-user list/update/delete/test isolation, real negative provider check persists auth_failure and measured latency, durable routing cursor, deployed account/provider persistence (no successful AI inference claimed).
  - `scripts/check-router-browser.mjs`: PASS live browser registration, encrypted connection creation, real failed health check, reload persistence, topology and unknown quota.
- Deployed production verification (`https://tern-ai-terngg.vercel.app`):
  - `scripts/check-web-deployment.mjs`: PASS public homepage and security headers, serverless GTPS reference (485 entries), router authentication requirements, cross-origin request protection, simulated testing endpoint retired.
  - `scripts/verify-router-deployment.mjs`: PASS managed PostgreSQL connectivity and seven router tables, AES-256-GCM encrypted persistence, cross-user isolation, real negative provider check persists auth_failure, durable routing cursor.
  - `scripts/check-router-browser.mjs`: PASS live browser registration, encrypted connection creation, real failed health check, reload persistence, topology and unknown quota.

## Known limitations

1. No valid provider keys were supplied for successful live inference; no provider card is preconnected.
2. Companion integrations are classifications and architecture boundaries; the companion software is not implemented. No private/local session scraping is used. No third-party OAuth provider flow is advertised as implemented.
3. Custom REST is unsupported. Compatible APIs require the documented text chat envelope and public HTTPS on port 443; redirects/private networks are rejected.
4. OAuth, tools, vision, image generation, embeddings, structured output and a full OpenAI/Anthropic API surface are not implemented. Compatibility routes are session-authenticated text chat only.
5. Account signup/login/logout are implemented; email verification, recovery, MFA and enterprise SSO are not.
6. Chat history remains browser-local and is not separated by server account on a shared browser. Signing out does not erase local history. Provider credentials are always user-isolated.
7. Pool selection is the current profile mechanism. There is no separate project/organization permissions product. Quality uses explicit user priority, fast uses measured latency, and cheap requires recent OpenRouter pricing. No inferred model-quality ranking is presented.
8. No remaining-quota percentages or billing balances are invented. Quota remains unknown except observed exhaustion. Metadata checks establish connectivity, not guaranteed model permissions or quota.
9. Inspector shows the latest 200 attempts; prompts/responses are not stored. Token counts/cost remain unknown when absent. Scheduled pruning must be configured operationally using router-prune.mjs.
10. Pools are account-selection/fallback pools, not an outbound HTTP proxy service. Topology shows configured edges, not claimed active traffic.
11. Model context is used when reported; otherwise the existing conservative GTPS context budget remains in force. No undocumented context limits or pricing are assumed.
12. Provider SSE protocols and model catalogs can change. Contract fixtures cannot replace credentialed provider monitoring.
