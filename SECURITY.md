# Security policy

Security fixes target the latest released version. Tern is an early-stage project; no response-time guarantee is offered.

## Report privately

Please use [GitHub private vulnerability reporting](https://github.com/terngg/tern-ai/security/advisories/new) for credential disclosure, unsafe file writes, or other vulnerabilities.

Do not post API keys, credential files, private scripts, or exploit details in a public issue. If the private reporting form is unavailable, open an issue asking the maintainer for a private reporting channel without disclosing the vulnerability itself.

Include the affected version, reproduction steps using synthetic data, impact, and any suggested fix. Revoke a compromised key in the provider console immediately; deleting a GitHub comment alone does not revoke it.

## Current security model

- Local credential files are separate from normal config and are **not encrypted**. POSIX permissions are `0600` for the file and `0700` for its directory.
- Environment credentials can be injected by your secret manager and are not automatically persisted.
- Known provider credentials are redacted from model context and output. Other application secrets still need to be removed before sending a Lua file.
- Provider requests send the explicit prompt, selected local API documentation, conversation context, and supplied Lua files to the selected provider. Automatic fallback can send that context to another configured provider.
- Tern does not execute generated Lua. Static validation does not prove runtime correctness or safety.
- There is no telemetry.
