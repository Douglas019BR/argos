# Contributing

Thanks for helping improve Argos. Keep changes small, focused, and testable.

## Setup

- Node.js 20+ and npm.
- `npm ci`
- `cp .env.example .env` and fill in the destination group JID.
- `CONFIG_DIR=config DATA_DIR=./data DRY_RUN=true npm run dev` to validate
  config and message formatting without sending WhatsApp messages.

Never commit `.env`, `data/` (WhatsApp session and `sent.db`), or any token.

## Changing code

- Add or update unit tests for every new piece of logic. Feeds, persistence,
  matching, formatting, and the pipeline should be testable without network,
  disk, or WhatsApp.
- Prefer dependency injection over globals; keep adapters thin.
- Use `feat:`, `fix:`, `chore:`, `docs:`, or `test:` prefixes in commit messages.

## Before opening a pull request

```bash
npm run verify
npm run build
```

`npm run verify` runs ESLint, Prettier check, cspell, the secret scan, TypeScript,
and all unit tests. CI runs the same commands on every pull request and must pass.
Include evidence (test output, logs, or screenshots) when the change affects
runtime behavior.

Open the pull request against `main` and describe what changed and how you
verified it.
