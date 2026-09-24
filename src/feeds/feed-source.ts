import type { Article } from '../domain/article.js';

export interface FeedSource {
  readonly name: string;
  /**
   * Fetches and normalizes the feed articles.
   * Never throws: a failing feed yields an empty list so the run continues.
   */
  fetchArticles(): Promise<Article[]>;
}
