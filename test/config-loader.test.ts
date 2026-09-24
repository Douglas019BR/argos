import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError } from '../src/config/config-error.js';
import { ConfigLoader } from '../src/config/config-loader.js';

const fixtures = join(process.cwd(), 'test', 'fixtures');
const validTickers = join(fixtures, 'tickers.yaml');
const validFeeds = join(fixtures, 'feeds.yaml');

const baseEnv = {
  WHATSAPP_GROUP_JID: '120363000000000000@g.us',
  DRY_RUN: 'true',
  WINDOW_HOURS: '5',
};

describe('ConfigLoader', () => {
  it('loads tickers and feeds', () => {
    const config = new ConfigLoader(validTickers, validFeeds, baseEnv).load();

    expect(config.tickers).toHaveLength(2);
    expect(config.tickers[0]).toEqual({
      ticker: 'PETR4',
      name: 'Petrobras',
      aliases: ['Petrobras', 'Petrobrás', 'PETR4', 'PETR3'],
    });
    expect(config.feeds).toHaveLength(2);
    expect(config.feeds[1]?.perTicker).toBe(true);
  });

  it('reads environment values with types applied', () => {
    const config = new ConfigLoader(validTickers, validFeeds, baseEnv).load();

    expect(config.groupJid).toBe('120363000000000000@g.us');
    expect(config.dryRun).toBe(true);
    expect(config.windowHours).toBe(5);
  });

  it('applies defaults for optional environment values', () => {
    const config = new ConfigLoader(validTickers, validFeeds, {
      WHATSAPP_GROUP_JID: 'x@g.us',
    }).load();

    expect(config.dryRun).toBe(false);
    expect(config.windowHours).toBe(5);
    expect(config.cron).toBe('0 */4 * * *');
    expect(config.dataDir).toBe('/data');
    expect(config.timezone).toBe('America/Sao_Paulo');
    expect(config.logLevel).toBe('info');
  });

  it('treats DRY_RUN=false as false', () => {
    const config = new ConfigLoader(validTickers, validFeeds, {
      ...baseEnv,
      DRY_RUN: 'false',
    }).load();

    expect(config.dryRun).toBe(false);
  });

  it('throws ConfigError when the group JID is missing', () => {
    expect(() => new ConfigLoader(validTickers, validFeeds, {}).load()).toThrow(ConfigError);
  });

  it('throws ConfigError when the ticker list is empty', () => {
    const empty = join(fixtures, 'tickers-empty.yaml');
    expect(() => new ConfigLoader(empty, validFeeds, baseEnv).load()).toThrow(ConfigError);
  });

  it('throws ConfigError when a feed URL is invalid', () => {
    const badFeeds = join(fixtures, 'feeds-bad-url.yaml');
    expect(() => new ConfigLoader(validTickers, badFeeds, baseEnv).load()).toThrow(ConfigError);
  });

  it('throws ConfigError when a config file does not exist', () => {
    expect(() =>
      new ConfigLoader(join(fixtures, 'missing.yaml'), validFeeds, baseEnv).load(),
    ).toThrow(ConfigError);
  });
});
