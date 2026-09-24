import { describe, expect, it, vi } from 'vitest';

import { FeedSourceFactory } from '../src/feeds/feed-source-factory.js';
import type { RssParser } from '../src/feeds/rss-parser.js';
import { RssFeedSource } from '../src/feeds/rss-feed-source.js';
import type { FeedConfig } from '../src/config/app-config.js';
import type { Ticker } from '../src/domain/ticker.js';
import { createLogger } from '../src/logging/logger.js';

const logger = createLogger('silent');
const parser: RssParser = { parseURL: vi.fn() };

const tickers: Ticker[] = [
  { ticker: 'PETR4', name: 'Petrobras', aliases: ['Petrobras', 'PETR4'] },
  { ticker: 'VALE3', name: 'Vale', aliases: ['Vale', 'VALE3'] },
];

const feeds: FeedConfig[] = [
  { name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', perTicker: false },
  {
    name: 'Google News',
    url: 'https://news.google.com/rss/search?q={ticker}&hl=pt-BR',
    perTicker: true,
  },
];

describe('FeedSourceFactory', () => {
  it('creates one source per feed and one per ticker for per-ticker feeds', () => {
    const sources = new FeedSourceFactory(parser, logger).create(feeds, tickers);

    expect(sources).toHaveLength(3);
    expect(sources.map((source) => source.name)).toEqual([
      'InfoMoney',
      'Google News (PETR4)',
      'Google News (VALE3)',
    ]);
  });

  it('substitutes the ticker placeholder in the URL', () => {
    const sources = new FeedSourceFactory(parser, logger).create(feeds, tickers);
    const petr = sources[1] as RssFeedSource;

    expect(petr.url).toBe('https://news.google.com/rss/search?q=PETR4&hl=pt-BR');
  });

  it('keeps non-templated feed URLs untouched', () => {
    const sources = new FeedSourceFactory(parser, logger).create(feeds, tickers);
    const infomoney = sources[0] as RssFeedSource;

    expect(infomoney.url).toBe('https://www.infomoney.com.br/feed/');
  });
});
