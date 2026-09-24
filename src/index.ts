import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Parser from 'rss-parser';

import { ConfigLoader } from './config/config-loader.js';
import { ConfigError } from './config/config-error.js';
import { FeedSourceFactory } from './feeds/feed-source-factory.js';
import { createLogger } from './logging/logger.js';
import { BaileysNotifier } from './notify/baileys-notifier.js';
import { ConsoleNotifier } from './notify/console-notifier.js';
import type { Notifier } from './notify/notifier.js';
import { ArticleMessageFormatter } from './pipeline/article-message-formatter.js';
import { NewsPipeline } from './pipeline/news-pipeline.js';
import { SqliteSentArticleStore } from './pipeline/sqlite-sent-article-store.js';
import { TickerMatcher } from './pipeline/ticker-matcher.js';
import { Scheduler } from './scheduler/scheduler.js';

async function main(): Promise<void> {
  const configDir = process.env.CONFIG_DIR ?? 'config';
  const config = new ConfigLoader(
    join(configDir, 'tickers.yaml'),
    join(configDir, 'feeds.yaml'),
    process.env,
  ).load();

  const logger = createLogger(config.logLevel);
  mkdirSync(config.dataDir, { recursive: true });

  const parser = new Parser();
  const sources = new FeedSourceFactory(parser, logger).create(config.feeds, config.tickers);
  const store = new SqliteSentArticleStore(join(config.dataDir, 'sent.db'));
  const notifier: Notifier = config.dryRun
    ? new ConsoleNotifier(logger)
    : new BaileysNotifier(join(config.dataDir, 'session'), logger);

  const pipeline = new NewsPipeline({
    sources,
    store,
    matcher: new TickerMatcher(config.tickers),
    formatter: new ArticleMessageFormatter(),
    notifier,
    groupJid: config.groupJid,
    windowHours: config.windowHours,
    now: () => new Date(),
    logger,
  });

  await notifier.start();
  await pipeline.run();

  const scheduler = new Scheduler(
    config.cron,
    async () => {
      await pipeline.run();
    },
    logger,
    config.timezone,
  );
  scheduler.start();

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down');
    scheduler.stop();
    await notifier.stop();
    store.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
