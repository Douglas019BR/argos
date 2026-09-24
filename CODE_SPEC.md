# Argos — Code Specification

Implementation spec for `PLAN.md`. This file defines the module layout, class
structure, interfaces, and conventions to build against.

---

## 1. Principles

- **KISS** — smallest design that works. No DI framework, no ORM, no event bus.
  Plain classes wired by hand in a single composition root.
- **DRY** — one place for each concern: one text-normalizer, one date parser, one
  config loader, one article type. Never duplicate normalization or matching logic.
- **No premature abstraction** — an interface exists only when there are ≥2
  implementations or a clear test seam. One `RssFeedSource` covers all RSS feeds
  (including Google News) via URL templating; no subclass needed.

### SOLID

- **S — Single Responsibility.** Each class has one reason to change and is named
  for it: `TickerMatcher` only matches, `ArticleMessageFormatter` only formats,
  `SqliteSentArticleStore` only persists. Modules map to folders by concern.
- **O — Open/Closed.** New behaviour is added by implementing an interface, not by
  editing existing classes. A new source = a new `FeedSource` impl; a new channel =
  a new `Notifier`. `NewsPipeline` never changes when either grows.
- **L — Liskov Substitution.** Every `FeedSource`/`Notifier`/`SentArticleStore`
  implementation honours its interface contract, including the documented
  "must not throw" rule on `fetchArticles()`. Fakes and real classes are
  interchangeable in the pipeline.
- **I — Interface Segregation.** Interfaces are tiny and role-specific
  (`FeedSource` has one method; `Notifier` has three). No fat "God" interface
  forcing implementers to stub unused methods.
- **D — Dependency Inversion.** High-level `NewsPipeline` depends on abstractions,
  not concretions; concrete classes are injected in the composition root
  (`index.ts`). This is exactly what enables dry-run and testability.

### TDD

- **Test-first.** For every unit, write the failing test, make it pass, then
  refactor (red → green → refactor). Implementation code is only written to
  satisfy a test.
- **Tests are mandatory** wherever the code is testable — i.e. everything except
  the thin adapters that touch the network/WhatsApp/socket directly
  (`BaileysNotifier`, `index.ts` bootstrap, `Scheduler`'s timer). Those are kept
  deliberately thin so almost all logic lives in tested code.
- **Design pressure.** If a unit is hard to test, that is a design smell — fix the
  design (inject a dependency, split a class) instead of skipping the test.
- **Fast and isolated.** Unit tests use no network, no disk, no WhatsApp, no sleeps.

---

## 2. File layout

```
argos/
  config/
    feeds.yaml
    tickers.yaml
  src/
    domain/
      article.ts          # Article, MatchedArticle types
      ticker.ts           # Ticker type
    text/
      normalize.ts        # stripHtml(), normalizeText(), truncate()
    time/
      parse-date.ts       # parseDate()
    config/
      app-config.ts       # AppConfig type + zod schemas
      config-error.ts     # ConfigError
      config-loader.ts    # ConfigLoader
    feeds/
      feed-source.ts      # FeedSource interface
      rss-parser.ts       # RssParser interface (narrow seam over rss-parser)
      rss-feed-source.ts  # RssFeedSource
      feed-source-factory.ts # FeedSourceFactory
    pipeline/
      ticker-matcher.ts   # TickerMatcher
      article-message-formatter.ts # ArticleMessageFormatter
      sent-article-store.ts        # SentArticleStore interface
      sqlite-sent-article-store.ts # SqliteSentArticleStore
      news-pipeline.ts    # NewsPipeline
    notify/
      notifier.ts         # Notifier interface
      console-notifier.ts # ConsoleNotifier
      baileys-notifier.ts # BaileysNotifier
      whatsapp-connection.ts # openWhatsAppSocket() shared by notifier + health
      whatsapp-health.ts  # WhatsAppHealthChecker
    scheduler/
      scheduler.ts        # Scheduler
    logging/
      logger.ts           # createLogger()
    index.ts              # composition root + signal handling
    health.ts             # WhatsApp health probe entrypoint
  test/
    *.test.ts
    fixtures/             # infomoney.xml, investing.xml
  data/                   # VOLUME: baileys session + sent.db
  .env.example
  Dockerfile
  docker-compose.yml
  eslint.config.js
  .prettierrc.json
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts
  PLAN.md
  CODE_SPEC.md
```

Rule: dependencies point inward. `domain/`, `text/`, `time/` depend on nothing.
`pipeline/` depends on domain + interfaces. `index.ts` depends on everything.

---

## 3. Domain types

```ts
// domain/article.ts
export interface Article {
  title: string;
  link: string;
  description: string; // plain text (HTML stripped); '' when absent
  publishedAt: Date; // always UTC
  source: string; // feed name, e.g. "InfoMoney"
}

export interface MatchedArticle extends Article {
  tickers: Ticker[];
}
```

```ts
// domain/ticker.ts
export interface Ticker {
  ticker: string; // "PETR4"
  name: string; // "Petrobras"
  aliases: string[]; // ["Petrobras", "Petrobrás", "PETR4", "PETR3"]
}
```

---

## 4. Configuration

```ts
// config/app-config.ts
export interface FeedConfig {
  name: string;
  url: string;
  perTicker: boolean;
}

export interface AppConfig {
  tickers: Ticker[];
  feeds: FeedConfig[];
  groupJid: string;
  windowHours: number;
  cron: string;
  dryRun: boolean;
  dataDir: string;
  logLevel: string;
  timezone: string;
}
```

zod schemas mirror these types and validate both YAML files and `process.env`.
Env mapping:

| Env                  | Field         | Default             |
| -------------------- | ------------- | ------------------- |
| `WHATSAPP_GROUP_JID` | `groupJid`    | required            |
| `WINDOW_HOURS`       | `windowHours` | `5`                 |
| `CRON`               | `cron`        | `0 */4 * * *`       |
| `DRY_RUN`            | `dryRun`      | `false`             |
| `DATA_DIR`           | `dataDir`     | `/data`             |
| `LOG_LEVEL`          | `logLevel`    | `info`              |
| `TZ`                 | `timezone`    | `America/Sao_Paulo` |

`CONFIG_DIR` (default `config`) is read by the bootstrap (`index.ts`) to locate the
YAML files; it is not part of `AppConfig`.

```ts
// config/config-loader.ts
export class ConfigLoader {
  constructor(
    private readonly tickersPath: string,
    private readonly feedsPath: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  load(): AppConfig; // throws ConfigError on invalid input
}
```

- Validate once, fail fast at startup with a clear message.
- `ConfigError` is a custom error class so the bootstrap can exit(1) cleanly.

---

## 5. Feed sources (Strategy + Factory)

```ts
// feeds/feed-source.ts
export interface FeedSource {
  readonly name: string;
  fetchArticles(): Promise<Article[]>;
}
```

```ts
// feeds/rss-parser.ts
export interface ParsedFeedItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
}

export interface ParsedFeed {
  items: ParsedFeedItem[];
}

export interface RssParser {
  parseURL(url: string): Promise<ParsedFeed>;
}
```

```ts
// feeds/rss-feed-source.ts
export class RssFeedSource implements FeedSource {
  constructor(
    public readonly name: string,
    public readonly url: string,
    private readonly parser: RssParser, // narrow seam; rss-parser satisfies it
    private readonly logger: Logger,
  ) {}

  async fetchArticles(): Promise<Article[]>; // never throws; returns [] on failure
}
```

- The narrow `RssParser` interface is the test seam; the real `rss-parser` `Parser`
  is injected by the composition root.
- Each item → `Article` via a private `toArticle()`: title, link, HTML-stripped
  `description`, `publishedAt` via `parseDate(item.pubDate) ?? parseDate(item.isoDate)`,
  `source = this.name`. Items without a title, link, or valid date are dropped.
- Errors are caught, logged, and returned as `[]` — a broken feed must not kill the run.

```ts
// feeds/feed-source-factory.ts
export class FeedSourceFactory {
  constructor(
    private readonly parser: RssParser,
    private readonly logger: Logger,
  ) {}

  create(feeds: FeedConfig[], tickers: Ticker[]): FeedSource[];
}
```

Factory logic:

- `perTicker: false` → one `RssFeedSource(name, url)`.
- `perTicker: true` → one `RssFeedSource(\`${name} (${ticker})\`, url.replaceAll('{ticker}', ticker))`
  per configured ticker.

This is why no `GoogleNewsFeedSource` class exists: it is just an `RssFeedSource`
with a substituted URL. DRY.

---

## 6. Text & time utilities

```ts
// text/normalize.ts
export function stripHtml(html: string): string; // html-to-text, collapse whitespace
export function normalizeText(text: string): string; // lowercase + strip accents (NFD)
export function truncate(text: string, max: number): string;
```

```ts
// time/parse-date.ts
export function parseDate(input: string | undefined): Date | null;
```

`parseDate` returns `null` when the input is missing or unreadable:

1. If it matches `yyyy-MM-dd HH:mm:ss` (Investing.com, timezone-less), parse as UTC
   via `DateTime.fromFormat(input, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' })`.
2. Otherwise `new Date(input)` (covers RFC-822 from InfoMoney).
3. Invalid input → `null`; the feed source drops the item.

These two modules are pure functions — the natural unit-test targets.

---

## 7. Deduplication (Repository)

```ts
// pipeline/sent-article-store.ts
export interface SentArticleStore {
  filterUnseen(articles: Article[]): Article[];
  markSent(articles: MatchedArticle[]): void;
  prune(olderThanDays: number): void;
  close(): void;
}
```

```ts
// pipeline/sqlite-sent-article-store.ts
export class SqliteSentArticleStore implements SentArticleStore {
  constructor(databasePath: string, now: () => Date = () => new Date()) {}
}
```

- `better-sqlite3`, schema from `PLAN.md` §5, created in the constructor.
- The clock is injectable so pruning is deterministic in tests.
- Key = `sha256(link)`.
- `filterUnseen` runs a single `SELECT link_hash ... WHERE link_hash IN (...)`.
- `markSent` uses a prepared `INSERT OR IGNORE` inside one transaction.
- Interface exists so tests can use an in-memory fake and so persistence could be
  swapped later without touching the pipeline.

---

## 8. Matcher

```ts
// pipeline/ticker-matcher.ts
export class TickerMatcher {
  constructor(tickers: Ticker[]);

  match(article: Article): Ticker[];
}
```

- Constructor precomputes `Map<normalizedAlias, Ticker>` (normalize once — DRY).
- `match` normalizes `title + ' ' + description` once, then tests each alias with a
  word-boundary regex `\b`, collecting distinct tickers.
- Returns `[]` when nothing matches; the pipeline drops those articles.

---

## 9. Formatter

```ts
// pipeline/article-message-formatter.ts
export class ArticleMessageFormatter {
  constructor(private readonly summaryMaxChars = 300) {}

  format(article: Article, tickers: Ticker[]): string;
}
```

Output (plain text, no emojis):

```
[PETR4 · Petrobras]
<title>

<first N chars of description, omitted when empty>

<link>
```

---

## 10. Notifier (Strategy)

```ts
// notify/notifier.ts
export interface Notifier {
  start(): Promise<void>;
  send(to: string, message: string): Promise<void>;
  stop(): Promise<void>;
}
```

- `BaileysNotifier` — loads session from `${dataDir}/session`, prints the QR with
  `qrcode-terminal` on first link, `send()` → `sock.sendMessage(to, { text })`, adds
  a small inter-message delay to reduce ban risk, `stop()` closes the socket.
- `ConsoleNotifier` — `send()` logs the message; used when `DRY_RUN=true`. No WhatsApp.

The pipeline only knows the `Notifier` interface, so dry-run needs no branching
inside the pipeline.

Both Baileys components share `openWhatsAppSocket()` (`notify/whatsapp-connection.ts`)
so the session/auth setup lives in one place.

```ts
// notify/whatsapp-health.ts
export type WhatsAppHealth = 'connected' | 'needs-auth' | 'no-session' | 'unknown';

export class WhatsAppHealthChecker {
  constructor(sessionDir: string, logger: Logger, timeoutMs = 20_000) {}
  check(): Promise<WhatsAppHealth>;
}
```

- Returns `no-session` when `creds.json` is absent, otherwise opens a short-lived
  socket: `open` → `connected`, a QR prompt or `loggedOut` close → `needs-auth`,
  timeout → `unknown`.
- `health.ts` runs it and maps statuses to exit codes (`0` connected, `2` needs
  auth, `1` unknown).

---

## 11. Pipeline (orchestrator)

```ts
// pipeline/news-pipeline.ts
export interface PipelineDeps {
  sources: FeedSource[];
  store: SentArticleStore;
  matcher: TickerMatcher;
  formatter: ArticleMessageFormatter;
  notifier: Notifier;
  groupJid: string;
  windowHours: number;
  now: () => Date;
  logger: Logger;
}

export interface PipelineResult {
  fetched: number;
  inWindow: number;
  matched: number;
  sent: number;
}

export class NewsPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async run(): Promise<PipelineResult>;
}
```

`run()` steps:

1. `fetchArticles()` from every source in parallel (`Promise.all`), flatten.
2. Keep items with `publishedAt >= now - windowHours`.
3. `store.filterUnseen(...)`.
4. `matcher.match(...)` each; drop unmatched.
5. `formatter.format(...)` each → send via `notifier.send(groupJid, msg)`.
6. `store.markSent(...)` for the sent ones.
7. `store.prune(30)`; return counts.

The pipeline owns orchestration only — no HTTP, no SQL, no WhatsApp specifics.

---

## 12. Scheduler

```ts
// scheduler/scheduler.ts
export class Scheduler {
  constructor(
    private readonly expression: string,
    private readonly job: () => Promise<void>,
    private readonly logger: Logger,
    private readonly timezone: string,
  ) {}

  start(): void;
  stop(): void;
}
```

- `node-cron` with the configured expression and timezone.
- Guards against overlapping runs with an internal `isRunning` flag.
- Catches task errors and logs them — a failed run must not crash the service.

---

## 13. Bootstrap (composition root)

```ts
// index.ts
async function main(): Promise<void> {
  const configDir = process.env.CONFIG_DIR ?? 'config';
  const config = new ConfigLoader(
    join(configDir, 'tickers.yaml'),
    join(configDir, 'feeds.yaml'),
    process.env,
  ).load();
  const logger = createLogger(config.logLevel);
  const parser = new Parser();
  const sources = new FeedSourceFactory(parser, logger).create(config.feeds, config.tickers);
  const store = new SqliteSentArticleStore(join(config.dataDir, 'sent.db'));
  const matcher = new TickerMatcher(config.tickers);
  const formatter = new ArticleMessageFormatter();
  const notifier = config.dryRun
    ? new ConsoleNotifier(logger)
    : new BaileysNotifier(join(config.dataDir, 'session'), logger);
  const pipeline = new NewsPipeline({ sources, store, matcher, formatter, notifier, ... });

  await notifier.start();
  await pipeline.run();                       // run once on boot
  const scheduler = new Scheduler(config.cron, async () => { await pipeline.run(); }, logger, config.timezone);
  scheduler.start();

  const shutdown = async () => { scheduler.stop(); await notifier.stop(); store.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

This is the only place that knows concrete classes. Everything else is wired by
constructor injection.

---

## 14. Errors & logging

- Custom `ConfigError` for startup validation; anything else logs and continues.
- Every module receives the shared `pino` logger; the only `console` use is the
  `health.ts` status line and the fatal error in `index.ts`.
- Per-feed failures are isolated (`RssFeedSource` returns `[]`).
- Per-send failures are logged and the loop continues.

---

## 15. Testing (TDD)

- **Runner:** vitest (`npm test`, `npm run test:watch`, `npm run test:coverage`).
- **Workflow:** red → green → refactor. Write the test first; commit only with
  passing tests.

### What MUST have unit tests

| Unit                      | Why it's testable          | Key cases                                                  |
| ------------------------- | -------------------------- | ---------------------------------------------------------- |
| `text/normalize.ts`       | pure                       | accents, case, HTML stripping, truncation                  |
| `time/parse-date.ts`      | pure                       | RFC-822, Investing `yyyy-MM-dd HH:mm:ss`, invalid → `null` |
| `TickerMatcher`           | pure                       | word-boundary hit/miss, accents, multi-ticker, case        |
| `ArticleMessageFormatter` | pure                       | with/without description, multi-ticker header              |
| `ConfigLoader`            | pure (given fixtures)      | valid load, missing env, bad YAML → `ConfigError`          |
| `RssFeedSource`           | fake parser / fixture XML  | maps fields, drops bad dates, returns `[]` on error        |
| `FeedSourceFactory`       | pure                       | `perTicker` expansion, `{ticker}` substitution             |
| `SqliteSentArticleStore`  | temp file / `:memory:`     | unseen filter, mark + dedupe, prune                        |
| `NewsPipeline`            | fakes + recording notifier | window filter, dedupe, matching, send order, counts        |

### What is exempt (thin adapters)

- `BaileysNotifier`, `ConsoleNotifier`'s I/O, `WhatsAppHealthChecker` and
  `openWhatsAppSocket`, `Scheduler`'s timer, `index.ts` and `health.ts`.
  Keep these free of logic; push any decision (e.g. delay, template) into tested
  helpers.

### How the pipeline is tested

Use fakes only — no network, no WhatsApp:

- a stub `FeedSource` returning fixed `Article[]`,
- an in-memory `SentArticleStore` implementing the same interface,
- a `RecordingNotifier` that captures `(to, message)` pairs.

Then assert the exact messages that _would_ be sent, plus the `PipelineResult`
counts, for scenarios: in-window vs stale, already-sent vs new, matched vs
unmatched, multi-source.

### Fixtures

- `test/fixtures/infomoney.xml` and `test/fixtures/investing.xml` — real samples
  covering the timezone-less `pubDate` and the missing `description` case.

---

## 16. Conventions

- `strict: true` in `tsconfig.json`; no `any` in public signatures.
- One exported class per file; file name = class name in kebab-case.
- Prefer `readonly` fields and constructor injection over setters/globals.
- Async methods that must not throw (feed fetch) say so in the interface docs.
- No comments unless a non-obvious decision needs explaining.
- **Every new unit of logic ships with its unit test in the same change** — no
  "tests later". A PR/commit without tests for testable code is incomplete.
- Test file lives next to the source or under `test/`, named `<unit>.test.ts`.
- `npm run lint` (ESLint + Prettier) and `npm test` must both pass before commit.

---

## 17. Build order (matches PLAN.md §10)

1. Scaffold (`package.json`, `tsconfig.json`, vitest, Docker, folders).
2. `domain/`, `text/`, `time/` — **test-first** (pure functions).
3. `config/` — test-first with fixtures.
4. `feeds/` — test-first with fixture XML.
5. `pipeline/` (store, matcher, formatter, pipeline) — test-first with fakes.
6. Dry-run end-to-end (`ConsoleNotifier`, `DRY_RUN=true`).
7. `notify/baileys-notifier.ts` (thin, manual verification).
8. `scheduler/` + `index.ts`.
9. Dockerize and deploy.

Every step except 1, 7 and 9 is implemented red → green → refactor.
