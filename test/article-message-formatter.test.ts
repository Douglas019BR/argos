import { describe, expect, it } from 'vitest';

import type { Article } from '../src/domain/article.js';
import type { Ticker } from '../src/domain/ticker.js';
import { ArticleMessageFormatter } from '../src/pipeline/article-message-formatter.js';

const petr: Ticker = { ticker: 'PETR4', name: 'Petrobras', aliases: ['Petrobras'] };
const vale: Ticker = { ticker: 'VALE3', name: 'Vale', aliases: ['Vale'] };

function article(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Petrobras anuncia dividendos',
    link: 'https://example.com/a',
    description: 'A companhia aprovou o pagamento.',
    publishedAt: new Date('2026-09-21T13:00:00.000Z'),
    source: 'InfoMoney',
    ...overrides,
  };
}

describe('ArticleMessageFormatter', () => {
  it('formats a message with a single ticker', () => {
    const formatter = new ArticleMessageFormatter();

    expect(formatter.format(article(), [petr])).toBe(
      '[PETR4 · Petrobras]\nPetrobras anuncia dividendos\n\nA companhia aprovou o pagamento.\n\nhttps://example.com/a',
    );
  });

  it('omits the description block when the description is empty', () => {
    const formatter = new ArticleMessageFormatter();

    expect(formatter.format(article({ description: '' }), [petr])).toBe(
      '[PETR4 · Petrobras]\nPetrobras anuncia dividendos\n\nhttps://example.com/a',
    );
  });

  it('lists multiple tickers in the header', () => {
    const formatter = new ArticleMessageFormatter();

    expect(formatter.format(article(), [petr, vale])).toContain(
      '[PETR4 · Petrobras, VALE3 · Vale]',
    );
  });

  it('truncates a long description', () => {
    const formatter = new ArticleMessageFormatter(10);
    const message = formatter.format(article({ description: 'abcdefghijklmno' }), [petr]);

    expect(message).toContain('abcdefghij…');
    expect(message).not.toContain('klmno');
  });
});
