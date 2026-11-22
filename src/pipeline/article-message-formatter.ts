import type { Article } from '../domain/article.js';
import type { Ticker } from '../domain/ticker.js';
import { truncate } from '../text/normalize.js';

const DEFAULT_SUMMARY_MAX_CHARS = 300;
const ARTICLE_SEPARATOR = '\n\n---\n\n';

/**
 * Builds the WhatsApp message body for one or more articles of a single stock.
 */
export class ArticleMessageFormatter {
  constructor(private readonly summaryMaxChars = DEFAULT_SUMMARY_MAX_CHARS) {}

  format(article: Article, tickers: Ticker[]): string {
    return `${this.formatHeader(tickers)}\n${this.formatArticle(article)}`;
  }

  formatForTicker(articles: Article[], ticker: Ticker): string {
    const bodies = articles.map((article) => this.formatArticle(article));
    return `${this.formatHeader([ticker])}\n${bodies.join(ARTICLE_SEPARATOR)}`;
  }

  private formatArticle(article: Article): string {
    const summary = this.formatSummary(article.description);
    return [article.title, summary, article.link].filter((block) => block !== '').join('\n\n');
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
