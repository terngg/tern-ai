# Codex account model catalog

Codex model discovery now calls the official local `codex app-server` stdio
`model/list` endpoint after its initialization handshake. It reads every cursor
page and includes picker-visible models only. This is a metadata request, not an
inference turn. The CLI remains local to Tern Companion; Vercel cannot read local
CLI credential files.

Older CLI versions fall back to `debug models`, then their public model metadata
cache when that command is unavailable. Only public IDs, display names, declared
context windows, and supported/default reasoning efforts leave the Companion.
Hidden/internal models, session identities, instructions and credentials are not
uploaded. A catalog entry does not prove successful inference or model entitlement.

The chat picker keeps each base model and adds its actual supported reasoning
options (including Ultra only when declared). The saved selection has the form
`connection::model::effort`. The router sends the original base model ID and a
separate `reasoningEffort` parameter; the local Codex adapter checks support again
and passes the choice as `model_reasoning_effort`. Selecting the base entry keeps
the model's declared default. Automatic routing also keeps the model default.
Higher effort can consume more provider quota.

Connections and model metadata remain scoped to the authenticated user. Invalid,
unsupported and cross-user selections are rejected before dispatch. Traces record
both the actual model ID and the selected effort when one is explicitly requested.
The picker refreshes its own account snapshot every 30 seconds while the page is
visible, as well as on focus and provider updates.

Official protocol reference: https://learn.chatgpt.com/docs/app-server#list-models-modellist

## Verification

- Actual local account discovery: eight picker-visible models, with 44 supported
  reasoning choices in total. Models: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`,
  `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`.
- Protocol tests cover handshake, pagination, hidden filtering, private metadata
  removal, repeated cursors, malformed responses, unavailable binaries and timeout.
- Adapter tests check exact model/effort arguments, default preservation and
  unsupported-model/effort rejection without inference.
- PostgreSQL integration tests check heartbeat persistence, selected model/effort
  relay payload, trace metadata and cross-user rejection.
- Playwright checks every discovered base model, effort availability, search,
  persistence, request selection, custom DOM picker and viewport fit at 1440,
  390 and 360 pixels. These fixtures validate behavior, not provider entitlement.

Verified on 2026-10-03 for product commit `409de84`:

- Lint, root/web typecheck and production build: passed.
- Unit/integration suite: 136 passed. Playwright: 20 passed locally and 20 passed
  on the deployed preview, including the existing full frontend regression suite.
- Preview: https://tern-9kdd3fry7-terngg.vercel.app
- Production: https://tern-ai-swart.vercel.app
  (deployment https://tern-kohuiv46g-terngg.vercel.app).
- Authenticated browser verification on both deployments: all eight real Codex
  base models and all 44 declared reasoning choices present, selection and focus
  behavior correct at 1440/390/360px, no native selects or browser dialogs.
- Actual `gpt-6-astra` with explicitly selected `low` reasoning completed on
  preview in 7.446s and production in 6.149s. Each used one completed relay job,
  one successful trace, no retry and no repair. Reported usage per check was
  7,093 input and 14 output tokens. The trace retained the base model ID and
  separate `low` effort. This is runtime proof for that combination only.
- Companion was updated from the committed build and restored to the canonical
  production URL. No provider credentials were uploaded during catalog discovery.
- Other models/efforts were verified for discovery and UI selection, not live
  inference; their provider availability and quotas can change.
