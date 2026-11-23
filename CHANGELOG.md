# Changelog

All notable changes to this project are documented here. Format follows
Keep a Changelog.

## [Unreleased]

## [0.1.0] - 2026-11-22

### Added

- YAML config loading with validation for tickers, feeds, and environment variables.
- RSS fetching and normalization, including timezone-less Investing.com dates.
- Ticker matching with accent/case-insensitive aliases and word boundaries.
- SQLite deduplication keyed by article link hash, with 30-day pruning.
- One grouped WhatsApp message per stock per run, with multi-article separation.
- Baileys notifier, QR login, persistent session, and a session health probe.
- In-process cron scheduler with an overlap guard.
- Docker and Compose setup with a persistent volume.
- Deterministic PR checks: ESLint, Prettier, cspell, secret scan, and Vitest.
