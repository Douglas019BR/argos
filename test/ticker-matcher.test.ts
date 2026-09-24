import { describe, expect, it } from 'vitest';

import type { Article } from '../src/domain/article.js';
import type { Ticker } from '../src/domain/ticker.js';
import { TickerMatcher } from '../src/pipeline/ticker-matcher.js';

const tickers: Ticker[] = [
  { ticker: 'PETR4', name: 'Petrobras', aliases: ['Petrobras', 'Petrobrás', 'PETR4', 'PETR3'] },
  { ticker: 'VALE3', name: 'Vale', aliases: ['Vale', 'VALE3'] },
];

const matcher = new TickerMatcher(tickers);

function article(title: string, description = ''): Article {
  return {
    title,
    link: 'https://example.com/a',
    description,
    publishedAt: new Date('2026-09-21T13:00:00.000Z'),
    source: 'test',
  };
}

describe('TickerMatcher', () => {
  it('matches an alias in the title', () => {
    expect(matcher.match(article('PETR4 sobe forte')).map((t) => t.ticker)).toEqual(['PETR4']);
  });

  it('matches the company name without accents', () => {
    expect(matcher.match(article('Petrobras paga dividendos')).map((t) => t.ticker)).toEqual([
      'PETR4',
    ]);
  });

  it('matches an accented company name', () => {
    expect(matcher.match(article('Petrobrás anuncia')).map((t) => t.ticker)).toEqual(['PETR4']);
  });

  it('matches an alias in the description', () => {
    expect(matcher.match(article('Mercado hoje', 'A Vale subiu')).map((t) => t.ticker)).toEqual([
      'VALE3',
    ]);
  });

  it('does not match a partial word', () => {
    expect(matcher.match(article('Valeu demais'))).toEqual([]);
  });

  it('matches multiple tickers in one article', () => {
    const matched = matcher.match(article('Petrobras e Vale sobem')).map((t) => t.ticker);
    expect(matched).toEqual(['PETR4', 'VALE3']);
  });

  it('returns each ticker once when several aliases hit', () => {
    const matched = matcher.match(article('Petrobras PETR4')).map((t) => t.ticker);
    expect(matched).toEqual(['PETR4']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(matcher.match(article('Notícia sobre tecnologia'))).toEqual([]);
  });
});
