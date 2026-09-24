import type { Article } from '../domain/article.js';
import type { Ticker } from '../domain/ticker.js';
import { normalizeText } from '../text/normalize.js';

interface AliasEntry {
  ticker: Ticker;
  pattern: RegExp;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWordBoundaryPattern(normalizedAlias: string): RegExp {
  return new RegExp(`\\b${escapeForRegex(normalizedAlias)}\\b`);
}

/**
 * Matches articles to tickers by testing each configured alias against the
 * article title and description, using word boundaries to avoid partial hits.
 */
export class TickerMatcher {
  private readonly aliasEntries: AliasEntry[];

  constructor(tickers: Ticker[]) {
    this.aliasEntries = tickers.flatMap((ticker) =>
      ticker.aliases.map((alias) => ({
        ticker,
        pattern: buildWordBoundaryPattern(normalizeText(alias)),
      })),
    );
  }

  match(article: Article): Ticker[] {
    const haystack = normalizeText(`${article.title} ${article.description}`);
    const matched = new Map<string, Ticker>();

    for (const entry of this.aliasEntries) {
      if (entry.pattern.test(haystack)) {
        matched.set(entry.ticker.ticker, entry.ticker);
      }
    }

    return [...matched.values()];
  }
}
