# Provider reliability and quota efficiency

The October 3 audit found two independent failures:

- Codex ran from an untrusted working directory without `--skip-git-repo-check`. It exited before inference. Authentication used an invalid command and directory existence; models used a fabricated fallback list.
- Three overlapping Antigravity Opus Thinking jobs reached the previous CLI deadline without producing any response text. The old 85/90/110-second CLI/account/request limits also constrained substantial script generation.

Changes:

- Codex uses `login status`, its public `debug models` catalog (or the CLI's public cache on older releases), an isolated temporary workspace, a read-only sandbox, ephemeral execution, and the exact selected model. It applies the model's declared default reasoning effort instead of inheriting a developer's local high-effort preference. It accepts only structured final-answer events and a successful completed turn, never raw diagnostics or tool output.
- Account leases use atomic PostgreSQL upserts in the existing limits table. They isolate users, share a lease across aliases of the same Companion identity, expire after bounded execution, and are released after success/error/cancellation. Busy accounts can be skipped in automatic routing, without changing their health or consuming inference quota. Companion job polling is an atomic claim, preventing duplicate dispatch.
- Vercel inference handlers use 300 seconds, with a 290-second total request deadline, 270-second Companion account deadline, and 260-second Antigravity CLI deadline. The project's Fluid Compute setting was checked. SSE keepalives preserve quiet connections while reasoning; visible partial responses never trigger a silent provider switch.
- A narrow conversational-message allowlist uses compact context in chat mode. Code tasks, attachments, follow-up edits, and validation repair retain GTPS retrieval and validation. Repeated category notes are included once, and break/harvest/gem-earned requests retrieve the relevant documented callbacks.
- Actual Codex input/output counts reported by its completed-turn event pass through the acknowledged relay into owner-scoped traces. Antigravity usage remains unknown when not reported. Neither integration fabricates a quota percentage. Provider usage allowance, credits and model-specific limits cannot be reset by Tern.

No database schema migration or credential changes are needed. This change does not re-enable disabled connections, bypass exhausted quota, or automatically change an explicitly selected model.

Local validation: 129 unit/integration tests passed; lint, typecheck and production build passed. Runtime results are recorded below after deployment verification.
