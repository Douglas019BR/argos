import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Parser from 'rss-parser';
import { describe, expect, it, vi } from 'vitest';

import { RssFeedSource } from '../src/feeds/rss-feed-source.js';
import type { ParsedFeed, RssParser } from '../src/feeds/rss-parser.js';
import { createLogger } from '../src/logging/logger.js';

const logger = createLogger('silent');
const fixtures = join(process.cwd(), 'test', 'fixtures');

function stubParser(feed: ParsedFeed): RssParser {
  return { parseURL: vi.fn().mockResolvedValue(feed) };
}

function readFixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

describe('RssFeedSource', () => {
  it('maps a parsed item into an article', async () => {
    const source = new RssFeedSource(
      'InfoMoney',
      'https://example.com/feed',
      stubParser({
        items: [
          {
            title: 'Petrobras paga dividendos',
            link: 'https://example.com/a',
            contentSnippet: '<p>Boa notícia</p>',
            isoDate: '2026-09-21T13:47:42.000Z',
          },
        ],
      }),
      logger,
    );

    const articles = await source.fetchArticles();

    expect(articles).toEqual([
      {
        title: 'Petrobras paga dividendos',
        link: 'https://example.com/a',
        description: 'Boa notícia',
        publishedAt: new Date('2026-09-21T13:47:42.000Z'),
        source: 'InfoMoney',
      },
    ]);
  });

  it('drops items without a link', async () => {
    const source = new RssFeedSource(
      'InfoMoney',
      'https://example.com/feed',
      stubParser({ items: [{ title: 'Sem link', pubDate: 'Mon, 21 Sep 2026 13:00:00 +0000' }] }),
      logger,
    );

    expect(await source.fetchArticles()).toEqual([]);
  });

  it('drops items without a valid date', async () => {
    const source = new RssFeedSource(
      'InfoMoney',
      'https://example.com/feed',
      stubParser({ items: [{ title: 'Sem data', link: 'https://example.com/a' }] }),
      logger,
    );

    expect(await source.fetchArticles()).toEqual([]);
  });

  it('uses an empty description when the item has no content', async () => {
    const source = new RssFeedSource(
      'Investing.com BR',
      'https://example.com/feed',
      stubParser({
        items: [
          { title: 'Vale sobe', link: 'https://example.com/a', pubDate: '2026-09-21 13:16:51' },
        ],
      }),
      logger,
    );

    const [article] = await source.fetchArticles();
    expect(article?.description).toBe('');
  });

  it('returns an empty list when the parser fails', async () => {
    const parser: RssParser = { parseURL: vi.fn().mockRejectedValue(new Error('network')) };
    const source = new RssFeedSource('Broken', 'https://example.com/feed', parser, logger);

    expect(await source.fetchArticles()).toEqual([]);
  });

  it('parses real InfoMoney XML into articles', async () => {
    const parser = new Parser();
    const parsed = await parser.parseString(readFixture('infomoney.xml'));
    const source = new RssFeedSource(
      'InfoMoney',
      'https://example.com/feed',
      stubParser(parsed),
      logger,
    );

    const articles = await source.fetchArticles();

    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toBe('Petrobras anuncia dividendos extraordinários');
    expect(articles[0]?.publishedAt.toISOString()).toBe('2026-09-21T13:47:42.000Z');
    expect(articles[0]?.description).toContain('Petrobras anunciou hoje');
  });

  it('parses real Investing.com XML with a timezone-less date', async () => {
    const parser = new Parser();
    const parsed = await parser.parseString(readFixture('investing.xml'));
    const source = new RssFeedSource(
      'Investing.com BR',
      'https://example.com/feed',
      stubParser(parsed),
      logger,
    );

    const articles = await source.fetchArticles();

    expect(articles).toHaveLength(1);
    expect(articles[0]?.publishedAt.toISOString()).toBe('2026-09-21T13:16:51.000Z');
    expect(articles[0]?.description).toBe('');
  });
});
