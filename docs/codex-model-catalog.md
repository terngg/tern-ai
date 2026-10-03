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
