import { describe, expect, it } from 'vitest';

import type { Article, MatchedArticle } from '../src/domain/article.js';
import type { Ticker } from '../src/domain/ticker.js';
import { SqliteSentArticleStore } from '../src/pipeline/sqlite-sent-article-store.js';

const petr: Ticker = { ticker: 'PETR4', name: 'Petrobras', aliases: ['Petrobras'] };

function article(link: string): Article {
  return {
    title: `Titulo ${link}`,
    link,
    description: '',
    publishedAt: new Date('2026-09-21T13:00:00.000Z'),
    source: 'test',
  };
}

function matched(link: string): MatchedArticle {
  return { ...article(link), tickers: [petr] };
}

function createStore(now: () => Date = () => new Date('2026-09-21T13:00:00.000Z')) {
  return new SqliteSentArticleStore(':memory:', now);
}

describe('SqliteSentArticleStore', () => {
  it('returns every article when nothing has been sent', () => {
    const store = createStore();
    const articles = [article('a'), article('b')];

    expect(store.filterUnseen(articles)).toEqual(articles);
  });

  it('filters out articles already sent', () => {
    const store = createStore();
    store.markSent([matched('a')]);

    expect(store.filterUnseen([article('a'), article('b')]).map((a) => a.link)).toEqual(['b']);
  });

  it('is idempotent when marking the same link twice', () => {
    const store = createStore();
    store.markSent([matched('a')]);
    store.markSent([matched('a')]);

    expect(store.filterUnseen([article('a')])).toEqual([]);
  });

  it('handles an empty article list', () => {
    const store = createStore();
    expect(store.filterUnseen([])).toEqual([]);
  });

  it('prunes entries older than the given number of days', () => {
    let current = new Date('2026-09-01T00:00:00.000Z');
    const store = createStore(() => current);
    store.markSent([matched('old')]);

    current = new Date('2026-09-21T00:00:00.000Z');
    store.markSent([matched('recent')]);
    store.prune(10);

    expect(store.filterUnseen([article('old'), article('recent')]).map((a) => a.link)).toEqual([
      'old',
    ]);
  });
});
