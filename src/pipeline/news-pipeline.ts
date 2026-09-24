import type { Article, MatchedArticle } from '../domain/article.js';
import type { FeedSource } from '../feeds/feed-source.js';
import type { Logger } from '../logging/logger.js';
import type { Notifier } from '../notify/notifier.js';
import type { ArticleMessageFormatter } from './article-message-formatter.js';
import type { SentArticleStore } from './sent-article-store.js';
import type { TickerMatcher } from './ticker-matcher.js';

const MILLIS_PER_HOUR = 3_600_000;
const PRUNE_DAYS = 30;

export interface PipelineDeps {
  sources: FeedSource[];
  store: SentArticleStore;
  matcher: TickerMatcher;
  formatter: ArticleMessageFormatter;
  notifier: Notifier;
  groupJid: string;
  windowHours: number;
  now: () => Date;
  logger: Logger;
}

export interface PipelineResult {
  fetched: number;
  inWindow: number;
  matched: number;
  sent: number;
}

/**
 * Orchestrates one run: fetch, filter by window, dedupe, match, format and send.
 * Owns no transport or persistence details — only the sequence.
 */
export class NewsPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async run(): Promise<PipelineResult> {
    const fetched = await this.fetchAll();
    const inWindow = this.withinWindow(fetched);
    const unseen = this.deps.store.filterUnseen(inWindow);
    const matched = this.matchTickers(unseen);
    const sent = await this.send(matched);

    this.deps.store.markSent(sent);
    this.deps.store.prune(PRUNE_DAYS);

    return {
      fetched: fetched.length,
      inWindow: inWindow.length,
      matched: matched.length,
      sent: sent.length,
    };
  }

  private async fetchAll(): Promise<Article[]> {
    const results = await Promise.all(this.deps.sources.map((source) => source.fetchArticles()));
    return results.flat();
  }

  private withinWindow(articles: Article[]): Article[] {
    const cutoff = this.deps.now().getTime() - this.deps.windowHours * MILLIS_PER_HOUR;
    return articles.filter((article) => article.publishedAt.getTime() >= cutoff);
  }

  private matchTickers(articles: Article[]): MatchedArticle[] {
    return articles
      .map((article) => ({ ...article, tickers: this.deps.matcher.match(article) }))
      .filter((article) => article.tickers.length > 0);
  }

  private async send(articles: MatchedArticle[]): Promise<MatchedArticle[]> {
    const sent: MatchedArticle[] = [];

    for (const article of articles) {
      const message = this.deps.formatter.format(article, article.tickers);

      try {
        await this.deps.notifier.send(this.deps.groupJid, message);
        sent.push(article);
      } catch (error) {
        this.deps.logger.warn({ err: error, link: article.link }, 'Failed to send article');
      }
    }

    return sent;
  }
}
