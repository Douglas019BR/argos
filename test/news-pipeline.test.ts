import { describe, expect, it } from 'vitest';

import type { Article, MatchedArticle } from '../src/domain/article.js';
import type { Ticker } from '../src/domain/ticker.js';
import type { FeedSource } from '../src/feeds/feed-source.js';
import { createLogger } from '../src/logging/logger.js';
import type { Notifier } from '../src/notify/notifier.js';
import { ArticleMessageFormatter } from '../src/pipeline/article-message-formatter.js';
import { NewsPipeline } from '../src/pipeline/news-pipeline.js';
import type { SentArticleStore } from '../src/pipeline/sent-article-store.js';
import { TickerMatcher } from '../src/pipeline/ticker-matcher.js';

const NOW = new Date('2026-09-21T12:00:00.000Z');
const logger = createLogger('silent');
const petr: Ticker = { ticker: 'PETR4', name: 'Petrobras', aliases: ['Petrobras', 'PETR4'] };

class StubFeedSource implements FeedSource {
  constructor(
    public readonly name: string,
    private readonly articles: Article[],
  ) {}

  async fetchArticles(): Promise<Article[]> {
    return this.articles;
  }
}

class InMemorySentArticleStore implements SentArticleStore {
  private readonly sent = new Set<string>();

  filterUnseen(articles: Article[]): Article[] {
    return articles.filter((article) => !this.sent.has(article.link));
  }

  markSent(articles: MatchedArticle[]): void {
    for (const article of articles) {
      this.sent.add(article.link);
    }
  }

  prune(): void {}

  close(): void {}
}

class RecordingNotifier implements Notifier {
  readonly messages: Array<{ to: string; message: string }> = [];
  failOn: string | null = null;

  async start(): Promise<void> {}

  async send(to: string, message: string): Promise<void> {
    if (this.failOn !== null && message.includes(this.failOn)) {
      throw new Error('send failed');
    }
    this.messages.push({ to, message });
  }

  async stop(): Promise<void> {}
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Petrobras anuncia dividendos',
    link: 'https://example.com/a',
    description: 'A companhia aprovou o pagamento.',
    publishedAt: new Date('2026-09-21T11:00:00.000Z'),
    source: 'test',
    ...overrides,
  };
}

function createPipeline(sources: FeedSource[], store = new InMemorySentArticleStore()) {
  const notifier = new RecordingNotifier();
  const pipeline = new NewsPipeline({
    sources,
    store,
    matcher: new TickerMatcher([petr]),
    formatter: new ArticleMessageFormatter(),
    notifier,
    groupJid: 'group@g.us',
    windowHours: 5,
    now: () => NOW,
    logger,
  });
  return { pipeline, notifier, store };
}

describe('NewsPipeline', () => {
  it('sends matched, in-window, unseen articles to the group', async () => {
    const { pipeline, notifier } = createPipeline([new StubFeedSource('test', [article()])]);

    const result = await pipeline.run();

    expect(notifier.messages).toHaveLength(1);
    expect(notifier.messages[0]?.to).toBe('group@g.us');
    expect(notifier.messages[0]?.message).toContain('[PETR4 · Petrobras]');
    expect(result).toEqual({ fetched: 1, inWindow: 1, matched: 1, sent: 1 });
  });

  it('drops articles older than the window', async () => {
    const stale = article({ publishedAt: new Date('2026-09-21T06:00:00.000Z') });
    const { pipeline, notifier } = createPipeline([new StubFeedSource('test', [stale])]);

    const result = await pipeline.run();

    expect(notifier.messages).toHaveLength(0);
    expect(result.inWindow).toBe(0);
  });

  it('skips articles already sent', async () => {
    const store = new InMemorySentArticleStore();
    store.markSent([{ ...article(), tickers: [petr] }]);
    const { pipeline, notifier } = createPipeline([new StubFeedSource('test', [article()])], store);

    const result = await pipeline.run();

    expect(notifier.messages).toHaveLength(0);
    expect(result.sent).toBe(0);
  });

  it('skips articles that match no ticker', async () => {
    const unmatched = article({ title: 'Notícia de tecnologia', description: '' });
    const { pipeline, notifier } = createPipeline([new StubFeedSource('test', [unmatched])]);

    const result = await pipeline.run();

    expect(notifier.messages).toHaveLength(0);
    expect(result.matched).toBe(0);
  });

  it('aggregates articles from multiple sources', async () => {
    const { pipeline } = createPipeline([
      new StubFeedSource('a', [article({ link: 'https://example.com/1' })]),
      new StubFeedSource('b', [article({ link: 'https://example.com/2' })]),
    ]);

    const result = await pipeline.run();

    expect(result.fetched).toBe(2);
    expect(result.sent).toBe(2);
  });

  it('marks an article as sent only after a successful send', async () => {
    const store = new InMemorySentArticleStore();
    const notifier = new RecordingNotifier();
    notifier.failOn = '[PETR4 · Petrobras]';
    const pipeline = new NewsPipeline({
      sources: [new StubFeedSource('test', [article()])],
      store,
      matcher: new TickerMatcher([petr]),
      formatter: new ArticleMessageFormatter(),
      notifier,
      groupJid: 'group@g.us',
      windowHours: 5,
      now: () => NOW,
      logger,
    });

    const result = await pipeline.run();

    expect(result.sent).toBe(0);
    expect(store.filterUnseen([article()])).toHaveLength(1);
  });
});
