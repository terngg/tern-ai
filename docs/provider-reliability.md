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

Additional findings during the real Daily Quest test:

- Antigravity completed an initial script, but an unknown `onPlayerLeaveCallback` caused validation to request repair. The previous managed context budget rejected the 14 KB draft before repair could run. Managed routing now uses a bounded 48 KB application budget and checks discovered model limits in the router; the direct CLI catalog-derived limits remain in place. Reconnect/disconnect requirements retrieve the correct documented callbacks. Substantial draft repair has a regression test.
- Greeting prompts in Generate mode are handled as conversation rather than requesting Lua and repeated repairs. Context/validation failures now have an accurate message instead of blaming provider connectivity.
- The task retrieval query excludes the assistant's generic task instruction. Word boundaries prevent “dialog” from matching “log”. This avoids unnecessary HTTP/logging reference material.
- Codex supplies a temporary text-chat instruction file and disables shell/web search for this chat-only invocation using documented CLI configuration, without changing the user's global settings.

Verification:

- 131 unit/integration tests passed; lint, root/web typechecks, and production build passed.
- 17 Playwright tests passed locally and on the final preview, including desktop, Android-sized model pickers, cancellation, uploads/history, routing choices, dialogs, toasts, and responsive pages.
- Native UI scan: select/option/datalist/alert/confirm/prompt all zero.
- Final preview: https://tern-m0d78ys46-terngg.vercel.app. Public/security/GTPS checks passed.
- Actual Codex `gpt-6-astra` greeting in Generate mode: 6.827 seconds, no code/repair, one trace, 483 request characters, two messages. The CLI initially reported 14,237 input tokens and 14 output tokens. After applying text-chat instructions and disabling unnecessary tools, the same greeting completed in 5.469 seconds with 7,093 reported input tokens and 14 output tokens. These are observed token counts, not a claim of proportional allowance or billing savings; caching and provider policies still apply.
- Actual Antigravity `claude-sonnet-4-6` Daily Quest generation on the final preview: 92.410 seconds, first text 7.752 seconds, 310 SSE text events, 18,688 response characters, 17,123 code characters, 28 GTPS reference entries, valid Lua syntax, zero validation errors, zero repairs, one completed provider trace. This exceeded the former account deadline. Antigravity token usage stayed null because the CLI did not report it.
- The original three overlapping Opus Thinking requests and exact 100%-to-0% quota change cannot be retroactively quantified. External rate limits/allowances remain provider controlled; this change does not fabricate remaining quota or promise refunds/reset.

The generated Lua was checked by the existing syntax/API validator, not executed inside a live GTPS game server. External model failures and the bounded request/repair limits still apply. Other Companion installations need the updated CLI. Temporary test sessions were removed. No production credentials or the pre-existing permission-bypass flag were included in the commits or deployment.


Production verification:

- Deployed the verified source to https://tern-2l3k3fbex-terngg.vercel.app and the canonical https://tern-ai-swart.vercel.app.
- Restored the paired Companion daemon to the production relay after verifying zero active jobs. Installed only the committed safe CLI build.
- Production Codex `gpt-6-astra` greeting: 5.931 seconds, one completed trace, no repair, 7,097 reported input tokens and 14 output tokens.
- Production Antigravity `claude-sonnet-4-6` greeting: 7.902 seconds, one completed trace, no repair; token usage remains unknown. The full Daily Quest test was run on the verified preview against the production database and was not repeated after production deployment to avoid unnecessary provider usage.
- Production public authentication/origin/GTPS checks passed. Authenticated browser checks with the actual paired account passed at 1440, 390 and 360 pixels, including model search/selection, Escape/focus, provider drawer, settings and mobile navigation. No native application selects/dialogs were present.
