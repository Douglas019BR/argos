import type { Article } from '../domain/article.js';
import type { Ticker } from '../domain/ticker.js';
import { truncate } from '../text/normalize.js';

const DEFAULT_SUMMARY_MAX_CHARS = 300;

/**
 * Builds the WhatsApp message body for a matched article.
 */
export class ArticleMessageFormatter {
  constructor(private readonly summaryMaxChars = DEFAULT_SUMMARY_MAX_CHARS) {}

  format(article: Article, tickers: Ticker[]): string {
    const header = `${this.formatHeader(tickers)}\n${article.title}`;
    const summary = this.formatSummary(article.description);

    return [header, summary, article.link].filter((block) => block !== '').join('\n\n');
  }

  private formatHeader(tickers: Ticker[]): string {
    const labels = tickers.map((ticker) => `${ticker.ticker} · ${ticker.name}`).join(', ');
    return `[${labels}]`;
  }

  private formatSummary(description: string): string {
    if (description.trim() === '') {
      return '';
    }

    return truncate(description, this.summaryMaxChars);
  }
}
