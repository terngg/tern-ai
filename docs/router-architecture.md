# Tern AI router migration

Tern AI remains the application. The existing `Assistant`, GTPS index, Lua validator,
bounded repair, browser chat history and attachments remain the task pipeline.
TernRouter is a read-only reference in a sibling checkout; histories are not merged.

## Source → destination map (inspection before implementation)

| TernRouter source | Tern AI adaptation |
| --- | --- |
| `open-sse/config/providers.js`, `providerModels.js` | `apps/web/lib/router/registry.ts`: capability/protocol registry, no seeded accounts/models |
| `open-sse/executors/default.js`, `base.js` | `router/adapters.ts`: public API adapters over a protected transport |
| `open-sse/translator/request/openai-to-claude.js`, response translators | text-message OpenAI/Anthropic protocol translation in adapters |
| `open-sse/handlers/chatCore/streamingHandler.js`, stream helpers | bounded SSE parsing, completion markers, cancellation, no fallback after visible output |
| `open-sse/services/accountFallback.js`, `config/errorConfig.js` | `router/engine.ts`, `errors.ts`: bounded account fallback and persisted cooldown |
| `src/lib/db/repos/providerHealthRepo.js`, connections repositories | `router/store.ts`, PostgreSQL migration: user-scoped encrypted connections and health |
| `src/lib/oauth/providers`, `services`, PKCE utilities | no desktop credential import; CLI integrations classified Companion-only |
| `src/lib/network/ssrf.js` | `router/transport.ts`: stricter address classification, DNS pinning, redirects rejected |
| `src/lib/db/repos/proxyPoolsRepo.js`, `combosRepo.js`, combo presets | user-owned connection pools and explicit fallback order; no outbound proxy credential import |
| routing / smart-routing modules | virtual model profiles over configured connections; measured latency only; no inferred prices/quality |
| request / usage logging repositories | metadata-only PostgreSQL request traces; no prompts or raw error bodies |
| provider configuration dashboard | Tern-branded grouped cards, server evidence, account editor, topology and inspector |
| custom compatible provider nodes | encrypted custom headers, protected URL, model discovery/manual selection, both protocols |
| quota integrations | Unknown unless an adapter obtains reliable quota evidence; HTTP exhaustion retained |

## Serverless boundary

PostgreSQL is the durable store for users, hashed sessions, encrypted credentials,
model caches, health, cooldown, selection state, rate limits, pools and traces.
No database was configured at initial inspection. Missing configuration fails closed;
there is no filesystem or in-memory production fallback and no global provider pool.
`DATABASE_URL` and a server-only 32-byte `TERN_CREDENTIAL_KEY` are required.

Credentials and custom header values use AES-256-GCM with user/connection-bound AAD.
The browser receives metadata only. Provider credentials are never session identities.
Authentication uses password hashing and random, hashed, expiring HttpOnly sessions.
All management and inference operations derive the owner from the server session.

## Deployment constraints

Live provider verification requires user-supplied credentials. Vercel login and the
existing project link are present. Database and encryption configuration must be
provided before live account/connection verification. Production must not be promoted
until preview and required live checks pass.

## Reference attribution

Architecture and error/address classification are adapted from
[terngg/TernRouter](https://github.com/terngg/TernRouter), derived from
[decolua/9router](https://github.com/decolua/9router). See
`licenses/TernRouter-MIT.txt` for the preserved MIT notice. No upstream branding or
local session-scraping flow is adopted.
