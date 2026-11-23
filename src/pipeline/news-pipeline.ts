import type { Article, MatchedArticle } from '../domain/article.js';
import type { Ticker } from '../domain/ticker.js';
import type { FeedSource } from '../feeds/feed-source.js';
import type { Logger } from '../logging/logger.js';
import type { Notifier } from '../notify/notifier.js';
import type { ArticleMessageFormatter } from './article-message-formatter.js';
import type { SentArticleStore } from './sent-article-store.js';
import type { TickerMatcher } from './ticker-matcher.js';

const MILLIS_PER_HOUR = 3_600_000;
const PRUNE_DAYS = 30;
const DEFAULT_MAX_ARTICLES_PER_MESSAGE = 10;

interface TickerGroup {
  ticker: Ticker;
  articles: MatchedArticle[];
}

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
  maxArticlesPerMessage?: number;
}

export interface PipelineResult {
  fetched: number;
  unique: number;
  inWindow: number;
  matched: number;
  sent: number;
  messages: number;
}

/**
 * Orchestrates one run: fetch, filter by window, dedupe, match, group by stock
 * and send one message per stock (splitting very large groups).
 */
export class NewsPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async run(): Promise<PipelineResult> {
    const fetched = await this.fetchAll();
    const inWindow = this.withinWindow(fetched);
    const unique = this.dedupeByLink(inWindow);
    const unseen = this.deps.store.filterUnseen(unique);
    const matched = this.matchTickers(unseen);
    const { sent, messages } = await this.send(this.groupByTicker(matched));

    this.deps.store.markSent(sent);
    this.deps.store.prune(PRUNE_DAYS);

    return {
      fetched: fetched.length,
      unique: unique.length,
      inWindow: inWindow.length,
      matched: matched.length,
      sent: sent.length,
      messages,
    };
  }

  private async fetchAll(): Promise<Article[]> {
    const results = await Promise.all(this.deps.sources.map((source) => source.fetchArticles()));
    return results.flat();
  }

  private dedupeByLink(articles: Article[]): Article[] {
    const links = new Set<string>();

    return articles.filter((article) => {
      if (links.has(article.link)) {
        return false;
      }

      links.add(article.link);
      return true;
    });
  }

  private withinWindow(articles: Article[]): Article[] {
    const cutoff = this.deps.now().getTime() - this.deps.windowHours * MILLIS_PER_HOUR;
    return articles.filter((article) => article.publishedAt.getTime() >= cutoff);
  }

  private matchTickers(articles: Article[]): MatchedArticle[] {
    return articles.flatMap((article) => {
      const ticker = this.deps.matcher.matchFirst(article);
      return ticker === null ? [] : [{ ...article, tickers: [ticker] }];
    });
  }

  private groupByTicker(articles: MatchedArticle[]): TickerGroup[] {
    const groups = new Map<string, TickerGroup>();

    for (const article of articles) {
      for (const ticker of article.tickers) {
        const group = groups.get(ticker.ticker) ?? { ticker, articles: [] };
        group.articles.push(article);
        groups.set(ticker.ticker, group);
      }
    }

    return [...groups.values()];
  }

  private chunk(articles: MatchedArticle[]): MatchedArticle[][] {
    const size = Math.max(1, this.deps.maxArticlesPerMessage ?? DEFAULT_MAX_ARTICLES_PER_MESSAGE);
    const chunks: MatchedArticle[][] = [];

    for (let index = 0; index < articles.length; index += size) {
      chunks.push(articles.slice(index, index + size));
    }

    return chunks;
  }

  private async send(groups: TickerGroup[]): Promise<{ sent: MatchedArticle[]; messages: number }> {
    const sent = new Map<string, MatchedArticle>();
    let messages = 0;

    for (const group of groups) {
      for (const chunk of this.chunk(group.articles)) {
        const message = this.deps.formatter.formatForTicker(chunk, group.ticker);

        try {
          await this.deps.notifier.send(this.deps.groupJid, message);
          messages += 1;
          for (const article of chunk) {
            sent.set(article.link, article);
          }
        } catch (error) {
          this.deps.logger.warn(
            { err: error, ticker: group.ticker.ticker, links: chunk.map((a) => a.link) },
            'Failed to send articles',
          );
        }
      }
    }

    return { sent: [...sent.values()], messages };
  }
}
