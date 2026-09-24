import type { Article, MatchedArticle } from '../domain/article.js';

export interface SentArticleStore {
  /** Returns only the articles whose link has not been sent yet. */
  filterUnseen(articles: Article[]): Article[];
  /** Records the articles as sent. */
  markSent(articles: MatchedArticle[]): void;
  /** Deletes entries older than the given number of days. */
  prune(olderThanDays: number): void;
  close(): void;
}
