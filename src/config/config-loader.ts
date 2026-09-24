import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import type { Ticker } from '../domain/ticker.js';
import {
  envSchema,
  feedsFileSchema,
  tickersFileSchema,
  type AppConfig,
  type FeedConfig,
} from './app-config.js';
import { ConfigError } from './config-error.js';

/**
 * Reads and validates the YAML config files and environment variables.
 * Throws {@link ConfigError} on the first invalid input so the app fails fast.
 */
export class ConfigLoader {
  constructor(
    private readonly tickersPath: string,
    private readonly feedsPath: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  load(): AppConfig {
    const tickers = this.readTickers();
    const feeds = this.readFeeds();
    const env = this.readEnv();

    return {
      tickers,
      feeds,
      groupJid: env.WHATSAPP_GROUP_JID,
      windowHours: env.WINDOW_HOURS,
      cron: env.CRON,
      dryRun: env.DRY_RUN,
      dataDir: env.DATA_DIR,
      logLevel: env.LOG_LEVEL,
      timezone: env.TZ,
    };
  }

  private readTickers(): Ticker[] {
    const parsed = tickersFileSchema.safeParse(this.readYaml(this.tickersPath));

    if (!parsed.success) {
      throw new ConfigError(
        `Invalid tickers config at ${this.tickersPath}: ${parsed.error.message}`,
      );
    }

    return parsed.data.tickers;
  }

  private readFeeds(): FeedConfig[] {
    const parsed = feedsFileSchema.safeParse(this.readYaml(this.feedsPath));

    if (!parsed.success) {
      throw new ConfigError(`Invalid feeds config at ${this.feedsPath}: ${parsed.error.message}`);
    }

    return parsed.data.feeds;
  }

  private readEnv(): ReturnType<typeof envSchema.parse> {
    const parsed = envSchema.safeParse(this.env);

    if (!parsed.success) {
      throw new ConfigError(`Invalid environment configuration: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  private readYaml(path: string): unknown {
    let contents: string;

    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      throw new ConfigError(`Cannot read config file at ${path}`);
    }

    try {
      return parseYaml(contents);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ConfigError(`Cannot parse YAML at ${path}: ${reason}`);
    }
  }
}
