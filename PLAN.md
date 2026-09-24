# Argos — Brazilian Stock News → WhatsApp

Monitor a fixed list of Brazilian stocks, pull news from Brazilian RSS feeds,
and push one WhatsApp message per matching article to a group.

---

## 1. Locked decisions

| Topic               | Decision                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Language            | **TypeScript only** (Node.js)                                                                 |
| WhatsApp            | **Baileys** (personal account, persistent session)                                            |
| Group target        | Group **JID** provided via env var                                                            |
| News sources        | Brazilian RSS feeds + Google News per-ticker search                                           |
| Article summary     | **RSS `description` only** — never fetch the article page. If absent, send title only         |
| Message granularity | **One message per article link**                                                              |
| Filter window       | **5 hours** (slightly over the 4h cadence to avoid gaps)                                      |
| Dedup               | **SQLite** (`better-sqlite3`) keyed by article link hash                                      |
| Scheduling          | **Every 4 hours, around the clock** (not restricted to B3 market hours), in-process scheduler |
| Runtime             | **Docker** container kept up (`restart: unless-stopped`), with a **persistent volume**        |
| Ticker list         | Provided by the user (hardcoded config file)                                                  |
| Language of news    | Portuguese (pt-BR feeds only)                                                                 |

### Why these two matter

- **Persistent volume is mandatory.** Baileys stores auth/session files; without a
  volume the bot would need a fresh QR scan on every restart. The same volume also
  holds `sent.db`.
- **5h window + SQLite.** A 24h window with 6 runs/day would repost each article
  ~6 times. The 5h window covers the 4h gap, and SQLite removes the overlap dupes.

---

## 2. Architecture

```
argos/
  config/
    feeds.yaml          # RSS sources (name, url, per-ticker flag)
    tickers.yaml        # ticker -> company name + aliases
  src/
    domain/             # Article, MatchedArticle, Ticker types
    text/               # HTML stripping, normalization, truncation
    time/               # feed date parsing
    config/             # YAML + env loading/validation (zod), ConfigError
    feeds/              # FeedSource, RssFeedSource, FeedSourceFactory, RssParser
    pipeline/           # TickerMatcher, ArticleMessageFormatter,
                        # SentArticleStore + SqliteSentArticleStore, NewsPipeline
    notify/             # Notifier, ConsoleNotifier, BaileysNotifier,
                        # WhatsApp connection + health checker
    scheduler/          # node-cron wrapper with overlap guard
    logging/            # pino logger
    index.ts            # bootstrap: load config, run, start scheduler
    health.ts           # WhatsApp session health probe
  test/                 # unit tests + RSS fixtures
  data/                 # VOLUME (gitignored): baileys session + sent.db
  .env.example
  Dockerfile
  docker-compose.yml
  package.json
  tsconfig.json
  PLAN.md
```

The exact file-by-file layout is in [`CODE_SPEC.md`](CODE_SPEC.md) §2.

### Flow per run

```
load config
  -> for each feed: fetch + parse
  -> normalize (title, link, description->plaintext, publishedAt, source)
  -> drop items older than 5h
  -> drop items already in SQLite (by link hash)
  -> match ticker(s) via aliases against title + description
  -> build one message per article link
  -> send via Baileys to GROUP_JID
  -> record sent link in SQLite
```

---

## 3. Tech stack

| Concern                  | Package                                     |
| ------------------------ | ------------------------------------------- |
| Runtime                  | Node.js 20 (Docker `node:20-bookworm-slim`) |
| Language                 | TypeScript                                  |
| Dev runner / build       | `tsx` (dev), `tsc` (build)                  |
| WhatsApp                 | `@whiskeysockets/baileys`                   |
| QR display (first login) | `qrcode-terminal`                           |
| RSS parsing              | `rss-parser`                                |
| SQLite                   | `better-sqlite3`                            |
| Scheduling               | `node-cron`                                 |
| Timezone                 | `luxon` (America/Sao_Paulo)                 |
| Config validation        | `zod`                                       |
| YAML parsing             | `yaml`                                      |
| Logging                  | `pino` (Baileys also uses pino)             |
| HTML → text              | `html-to-text` (for RSS descriptions)       |

---

## 4. Configuration

### `config/tickers.yaml` (user-provided list)

```yaml
tickers:
  - ticker: PETR4
    name: Petrobras
    aliases: ['Petrobras', 'Petrobrás', 'PETR4', 'PETR3']
  - ticker: VALE3
    name: Vale
    aliases: ['Vale', 'VALE3']
```

### `config/feeds.yaml`

```yaml
feeds:
  - name: InfoMoney
    url: https://www.infomoney.com.br/feed/
    perTicker: false
  - name: Investing.com BR
    url: https://br.investing.com/rss/news.rss
    perTicker: false
  - name: Google News
    # {ticker} is replaced per configured ticker
    url: 'https://news.google.com/rss/search?q={ticker}&hl=pt-BR&gl=BR&ceid=BR:pt-419'
    perTicker: true
```

### `.env`

```dotenv
WHATSAPP_GROUP_JID=1203630xxxxxxxxx@g.us
TZ=America/Sao_Paulo
WINDOW_HOURS=5
CRON=0 */4 * * *
DRY_RUN=false
DATA_DIR=/data
LOG_LEVEL=info
```

---

## 5. Data model (SQLite)

```sql
CREATE TABLE IF NOT EXISTS sent_articles (
  link_hash   TEXT PRIMARY KEY,   -- sha256(link)
  link        TEXT NOT NULL,
  title       TEXT NOT NULL,
  tickers     TEXT NOT NULL,      -- comma-separated matched tickers
  sent_at     TEXT NOT NULL       -- ISO-8601
);

CREATE INDEX IF NOT EXISTS idx_sent_at ON sent_articles(sent_at);
```

Rows older than 30 days are pruned at the end of each run.

---

## 6. Matching logic

- Normalize text: lowercase + strip accents (NFD, remove combining marks).
- For each ticker alias, match on **word boundaries** to avoid false positives
  (e.g. `VALE` should not match `VALEU`, `PETR` should not match `PETRÓLEO` unless aliased).
- Match against `title + " " + description`.
- An article can match multiple tickers; a single message lists all matched tickers.

---

## 7. Message format (one per link)

Plain WhatsApp text, no emojis:

```
[PETR4 · Petrobras]
<article title>

<first ~300 chars of RSS description, HTML stripped — omitted if empty>

<article link>
```

---

## 8. Scheduling & lifecycle

- Long-running service. `node-cron` triggers the pipeline every 4h, around the
  clock while the process is up — news does not follow B3 market hours, so there
  is no market-hours gating.
- Runs once on boot, then on the schedule.
- Baileys connects once at startup, stays connected, sends on each run.
- On first start, print the QR code to the logs (`qrcode-terminal`). Scan once;
  the session persists in the volume afterward.
- A `health.ts` probe reports whether the session is still valid (`connected`,
  `needs-auth`, `no-session`, `unknown`) so re-authentication is predictable.
- Graceful shutdown on SIGTERM/SIGINT (close socket, flush logger).

---

## 9. Docker

- `docker-compose.yml` with a single service.
- Volume: `./data:/data` (Baileys session + `sent.db`).
- `restart: unless-stopped`.
- `node:20-bookworm-slim` + build tools for `better-sqlite3` (or switch to a
  prebuilt-binary friendly base if build becomes a hassle).

```yaml
services:
  argos:
    build: .
    env_file: .env
    volumes:
      - ./data:/data
    restart: unless-stopped
```

---

## 10. Milestones

1. **Scaffold** — `package.json`, `tsconfig.json`, `Dockerfile`, compose, folder layout.
2. **Config** — load + validate `tickers.yaml`, `feeds.yaml`, `.env` with zod.
3. **Fetch/parse** — RSS fetch + normalize (including Investing.com's timezone-less
   `pubDate`; assume UTC and store as UTC).
4. **Filter + dedup** — 5h window and SQLite check/insert.
5. **Matcher** — alias matching with accent/case normalization.
6. **Dry run** — `DRY_RUN=true` logs the exact messages to stdout, no WhatsApp.
7. **Sender** — Baileys session, QR first login, send to `WHATSAPP_GROUP_JID`.
8. **Scheduler** — wire `node-cron`, add the service loop.
9. **Dockerize + deploy** — volume, restart policy, first QR scan.

Recommended order of implementation: 1→6 fully working in dry-run before touching
the sender (step 7 needs the QR/session dance).

---

## 11. Risks / notes

- **Ban risk:** automating a _personal_ WhatsApp account with Baileys is against
  WhatsApp ToS and can get the number banned. Keep message volume sane and add a
  small delay between sends. Consider a dedicated number.
- **Investing.com feed:** items sometimes lack `description` and its `pubDate` has
  no timezone — handle both.
- **Google News links** are redirect URLs (`news.google.com/rss/articles/...`).
  Fine for dedup by link, but the link users click will be a Google redirect.
- **Feed drift:** feeds change/break. Fail soft per feed (log + continue), never
  let one bad feed kill the run.
