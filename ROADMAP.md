# Tern AI roadmap

These are proposed improvements, not release dates or promises. Discuss a task in an issue before starting significant work.

## Available now

- [x] Local GTPS documentation with 485 API entries and fast retrieval.
- [x] Generate, chat, fix, review, and explain workflows.
- [x] Gemini and OpenRouter streaming adapters.
- [x] Multiple credentials, round-robin selection, cooldowns, and bounded fallback.
- [x] Local Lua/GTPS validation and bounded repair.
- [x] Provider-aware chat model selection with `/model` and `/models`.
- [x] Automated tests that use mock providers and no real API keys.

## Contributions welcome

### Small documentation and usability tasks

- [ ] Add a concise English quick-start guide that mirrors the Indonesian setup.
- [ ] Document a Windows PowerShell walkthrough for multi-key setup and raw output.
- [ ] Add a small set of GTPS examples, with every API checked against the bundled documentation and the static validator.

### Reliability

- [ ] Add more transport fixtures for provider interruptions, Unicode chunk boundaries, and paginated model discovery.
- [ ] Improve guidance when a selected model is retired or inaccessible to a particular project.
- [ ] Add pseudo-terminal coverage for hidden credential input and Ctrl+C during model discovery.

### Security and maintenance

- [ ] Evaluate OS keychain adapters with explicit platform coverage and a documented migration path from local credentials.
- [ ] Add provider-specific cost/usage summaries without persisting prompts or credentials.

## Proposing something else

Open a feature request explaining the GTPS workflow it improves. Features must preserve local API authority, clean raw output, bounded provider retries, and explicit consent for paid-model selection.
