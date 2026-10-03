# Companion stream delivery fix

Two production Antigravity requests failed after 90,128ms and 90,140ms, with 338 and 318 uploaded chunks respectively. The CLI consumer awaited one HTTP round trip per token. This delayed draining the CLI stream and delivering completion until the account's 90-second deadline. Upload failures and HTTP error responses were also previously ignored.

Commit `dc80f17` separates CLI consumption from ordered HTTP delivery. Text is coalesced with an 80ms flush interval, bounded batches and a two-million-character response limit. The terminal event is delivered only after preceding text is acknowledged. An upload failure cancels local execution and cannot fabricate completion.

Each upload carries a sequence. PostgreSQL atomically checks it against the persisted token chunk count; replaying the same batch after a lost acknowledgement is safe. A different payload at an existing position or an out-of-order event is rejected. Jobs remain scoped to the authenticated Companion, and cancelled jobs cannot be revived. Transient delivery failures retry at most three times; deterministic authorization/order errors do not retry. Existing clients remain accepted. No schema migration or shared in-memory state was introduced. The prohibition on switching providers after partial output remains intact.

## Verification

- `npm test`: 122 passed, including slow-network batching, live delivery, truncation, cancellation, failed uploads, lost acknowledgements, concurrent duplicate uploads and Companion isolation.
- Lint, root/web typechecks and production build passed.
- Four Playwright chat regression tests passed: streaming, cancellation, artifacts/files/history, model selection, XSS, GTPS and legacy credential removal.
- Preview: https://tern-pkmwvfusr-terngg.vercel.app.
- Production build: https://tern-8quodp6do-terngg.vercel.app, aliased to https://tern-ai-swart.vercel.app.
- A **synthetic transport test** against deployed Vercel and PostgreSQL sent 3,000 input fragments in six HTTP requests, including an intentionally lost acknowledgement. All text was stored exactly once: 4.2s on preview, 3.4s on production. Temporary verification jobs were deleted.
- The paired Companion daemon was updated and restarted while no jobs were active.
- **Real production inference** through Antigravity / `claude-sonnet-4-6`: 220 requested Lua comment lines, 14,768 output characters, 108 streaming events, first text at 6.855s, completed at 34.428s with the requested final marker. No interrupted-stream error occurred.
- Public deployment checks passed, including authenticated router boundaries, cross-origin protection and 485 GTPS entries. Temporary verification sessions were deleted.

Provider failures and configured request deadlines still apply. This fix removes the per-token network bottleneck and silent delivery loss; it does not claim that external streams can never fail. Other installed Companion instances need the updated CLI modules to benefit from batching.
