# Argos

The giant with multiple eyes. Watches a fixed list of Brazilian stocks across
RSS feeds and pushes one WhatsApp message per matching article to a group.

- Sources: InfoMoney, Investing.com BR, and a Google News search per ticker.
- Matching: accent/case-insensitive aliases with word boundaries (`PETR4`, `Petrobras`, ...).
- Delivery: one message per article link, to a WhatsApp group via Baileys.
- No duplicates: sent links are recorded in SQLite.
- Runs every 4 hours, around the clock while the process is up — not restricted
  to B3 market hours (news does not follow the market schedule).

---

## How it works

```
load config
  -> for each feed: fetch + parse RSS
  -> normalize (title, link, description -> plain text, publishedAt, source)
  -> drop items older than WINDOW_HOURS (default 5)
  -> drop items already sent (SQLite, keyed by link hash)
  -> match tickers via aliases against title + description
  -> format one message per article
  -> send to WHATSAPP_GROUP_JID
  -> record sent links
```

A run happens once at startup and then on the cron schedule.

---

## Requirements

- Node.js 20+ (or Docker)
- A WhatsApp account (personal account works; see [Risks](#risks))
- The group JID of the destination group

---

## Configuration

### Environment (`.env`)

Copy `.env.example` to `.env` and fill it in:

| Variable             | Required | Default             | Meaning                                         |
| -------------------- | -------- | ------------------- | ----------------------------------------------- |
| `WHATSAPP_GROUP_JID` | yes      | —                   | Destination group, e.g. `1203630xxxxxxxxx@g.us` |
| `WINDOW_HOURS`       | no       | `5`                 | Only articles newer than this are sent          |
| `CRON`               | no       | `0 */4 * * *`       | Run schedule (every 4 hours)                    |
| `DRY_RUN`            | no       | `false`             | `true` logs messages instead of sending         |
| `DATA_DIR`           | no       | `/data`             | Holds the WhatsApp session and `sent.db`        |
| `LOG_LEVEL`          | no       | `info`              | `pino` level (`silent`, `info`, `debug`, ...)   |
| `TZ`                 | no       | `America/Sao_Paulo` | Timezone for the cron schedule                  |
| `CONFIG_DIR`         | no       | `config`            | Folder holding the YAML files                   |

### `config/tickers.yaml`

Your stock list. `aliases` are what gets matched against article text.

```yaml
tickers:
  - ticker: PETR4
    name: Petrobras
    aliases: [Petrobras, Petrobrás, PETR4, PETR3]
```

### `config/feeds.yaml`

RSS sources. With `perTicker: true`, the `{ticker}` placeholder is replaced once
per configured ticker, producing one feed per ticker.

```yaml
feeds:
  - name: InfoMoney
    url: https://www.infomoney.com.br/feed/
    perTicker: false
  - name: Google News
    url: https://news.google.com/rss/search?q={ticker}&hl=pt-BR&gl=BR&ceid=BR:pt-419
    perTicker: true
```

---

## Running with Docker

```bash
cp .env.example .env
# edit .env, then:
docker compose up -d
docker compose logs -f argos
```

The first run prints a QR code in the logs (see below). `./data` is mounted into
the container and keeps the session plus `sent.db` across restarts.

## Running locally

```bash
npm install
cp .env.example .env
npm run dev          # tsx watch
# or
npm run build && npm start
```

Dry-run mode is the fastest way to validate config without WhatsApp:

```bash
DRY_RUN=true DATA_DIR=./data CONFIG_DIR=config npm run dev
```

---

## First-time WhatsApp authentication

Baileys links to WhatsApp through a QR code. The session is stored in
`$DATA_DIR/session`, so this is done **once**.

1. Start the service (`docker compose up` or `npm start`).
2. In the logs you will see a QR code and:
   `Scan the QR code above to link the WhatsApp account`.
3. On your phone: **WhatsApp → Settings → Linked devices → Link a device** and
   scan the code.
4. The logs then show `Connected to WhatsApp`. The session is now persisted.

The bot account must already be a member of the destination group.

---

## Checking WhatsApp health (do I need to authenticate again?)

Use the health probe to know whether the stored session is still valid:

```bash
# Docker
docker compose run --rm argos node dist/health.js

# Local (built) or dev
DATA_DIR=./data npm run health
DATA_DIR=./data npm run health:dev
```

It prints one of these and exits with a matching code:

| Status       | Exit | Meaning                                    | Action                          |
| ------------ | ---- | ------------------------------------------ | ------------------------------- |
| `connected`  | `0`  | Session is valid and linked                | None                            |
| `needs-auth` | `2`  | QR prompt or server-side logout            | Re-authenticate (below)         |
| `no-session` | `2`  | No session on disk yet                     | Authenticate for the first time |
| `unknown`    | `1`  | No `open`/QR within the timeout (network?) | Retry; check connectivity       |

> Run the probe **while the service is stopped**. Two sockets sharing the same
> session will disconnect each other (WhatsApp code `440`, connection replaced).
> For a running service, watch the logs instead — a server-side logout is logged
> as `WhatsApp session logged out; a new QR scan is required`.

### Re-authenticating

When the probe reports `needs-auth` (or the service logs a logout), the stored
session is dead and must be relinked:

```bash
# stop the service
docker compose down

# remove the stale session (keep sent.db so no articles are reposted)
rm -rf ./data/session

# start again and scan the QR shown in the logs
docker compose up -d && docker compose logs -f argos
```

Locally, the equivalent is deleting `$DATA_DIR/session` and restarting.

You can also use the health probe as a scheduled/CI check: exit code `2` means a
human needs to relink the account.

---

## Message format

```
[PETR4 · Petrobras]
<article title>

<summary from the RSS description, when present>

<article link>
```

No emojis, plain WhatsApp text. When the RSS item has no description (common on
Investing.com), the summary block is omitted.

---

## Commands

| Command                 | What it does                          |
| ----------------------- | ------------------------------------- |
| `npm run dev`           | Run with `tsx watch`                  |
| `npm run build`         | Compile TypeScript to `dist/`         |
| `npm start`             | Run the compiled service              |
| `npm run health`        | Check the WhatsApp session (compiled) |
| `npm run health:dev`    | Check the WhatsApp session (`tsx`)    |
| `npm test`              | Run unit tests (vitest)               |
| `npm run test:watch`    | Tests in watch mode                   |
| `npm run test:coverage` | Tests with coverage                   |
| `npm run typecheck`     | `tsc --noEmit`                        |
| `npm run lint`          | ESLint                                |
| `npm run format`        | Prettier write                        |

---

## Project structure

```
src/
  domain/     Article and Ticker types
  text/       HTML stripping, accent/case normalization, truncation
  time/       Feed date parsing (RFC-822 and timezone-less formats)
  config/     YAML + env loading and validation (zod)
  feeds/      FeedSource interface, RssFeedSource, FeedSourceFactory
  pipeline/   Matcher, formatter, sent-article store, NewsPipeline
  notify/     Notifier interface, ConsoleNotifier, BaileysNotifier, health checker
  scheduler/  Cron scheduler with overlap guard
  logging/    pino logger
  index.ts    Composition root
  health.ts   WhatsApp health probe entrypoint
test/         Unit tests and RSS fixtures
config/       tickers.yaml, feeds.yaml
data/         Runtime volume: WhatsApp session + sent.db
```

Design and conventions are documented in [`PLAN.md`](PLAN.md) and
[`CODE_SPEC.md`](CODE_SPEC.md).

---

## Risks

- **Account ban.** Automating a personal WhatsApp account with Baileys is
  against WhatsApp's Terms of Service and can get the number banned. Keep volume
  low and consider a dedicated number.
- **Google News links** are redirect URLs (`news.google.com/rss/articles/...`).
- **Feed drift.** Feeds change or break. A failing feed is logged and skipped; it
  never aborts the run.
