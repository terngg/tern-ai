# Contributing to Tern AI

Thank you for helping improve a terminal coding assistant for GTPS Hosting Lua.
Issues and pull requests are welcome in **Bahasa Indonesia or English**.

## Run the project

```sh
git clone https://github.com/terngg/tern-ai.git
cd tern-ai
npm ci
npm run build
node dist/index.js --help
npm test
```

Node.js 22.16+ is required. Automated tests mock Gemini and OpenRouter; you do not need API keys. Use the local entry point when testing because another package can also provide a `tern` binary.

## What to work on

See [ROADMAP.md](ROADMAP.md) for concrete areas where contributions help. For a substantial change, open an issue describing the user problem and intended behavior before implementing it. Small documentation corrections can go directly into a pull request.

Useful contributions include reproducible bugs, clearer Indonesian/English documentation, provider transport regression tests, and small GTPS examples that use documented APIs.

## Before opening a pull request

```sh
npm run lint
npm run build
npm test
```

- Keep changes focused and explain the behavior before and after your change.
- Add regression coverage for behavior changes; explain what you tested.
- Preserve compatibility with existing commands and `OPENROUTER_API_KEY`.
- Keep `--raw` stdout limited to one final, locally validated Lua script.
- Preserve bounded retries, cancellation, and free-first provider fallback.
- Treat [the local API documentation](docs/gtps-lua-api.md) as the GTPS source of truth. Do not add APIs based on model suggestions alone.
- Do not commit keys, `.env` files, credential stores, private scripts, or request transcripts. Use synthetic credentials in tests.
- Never require real credentials or network generation in the normal test suite.

## Reporting a bug

Include your Tern version, OS, Node version, the command used, and the smallest reproduction. Remove secrets and private code before posting logs. `--verbose` helps diagnose provider/key selection; it must never reveal the key itself.

Provider outages, quota limits, and model availability can change independently of Tern. Include the normalized HTTP error when available and distinguish an upstream failure from a local validation issue.

For security problems, use [private reporting](SECURITY.md).

## Contribution terms

Code contributions are made under this repository's MIT license. Only submit code and documentation you are authorized to share. Be respectful, explain disagreements with evidence, and do not spam issues or pull requests.
