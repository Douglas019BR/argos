import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import type { Article, MatchedArticle } from '../domain/article.js';
import type { SentArticleStore } from './sent-article-store.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sent_articles (
  link_hash TEXT PRIMARY KEY,
  link      TEXT NOT NULL,
  title     TEXT NOT NULL,
  tickers   TEXT NOT NULL,
  sent_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sent_at ON sent_articles(sent_at);
`;

const MILLIS_PER_DAY = 86_400_000;

function hashLink(link: string): string {
  return createHash('sha256').update(link).digest('hex');
}

/**
 * SQLite-backed {@link SentArticleStore} keyed by a hash of the article link.
 * The clock is injectable so pruning is deterministic in tests.
 */
export class SqliteSentArticleStore implements SentArticleStore {
  private readonly database: Database.Database;

  constructor(
    databasePath: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.database = new Database(databasePath);
    this.database.exec(SCHEMA);
  }

  filterUnseen(articles: Article[]): Article[] {
    if (articles.length === 0) {
      return [];
    }

    const hashes = articles.map((article) => hashLink(article.link));
    const placeholders = hashes.map(() => '?').join(', ');
    const rows = this.database
      .prepare(`SELECT link_hash FROM sent_articles WHERE link_hash IN (${placeholders})`)
      .all(...hashes) as Array<{ link_hash: string }>;

    const sentHashes = new Set(rows.map((row) => row.link_hash));
    return articles.filter((article) => !sentHashes.has(hashLink(article.link)));
  }

  markSent(articles: MatchedArticle[]): void {
    const insert = this.database.prepare(
      'INSERT OR IGNORE INTO sent_articles (link_hash, link, title, tickers, sent_at) VALUES (?, ?, ?, ?, ?)',
    );
    const sentAt = this.now().toISOString();

    const insertAll = this.database.transaction((items: MatchedArticle[]) => {
      for (const item of items) {
        insert.run(
          hashLink(item.link),
          item.link,
          item.title,
          item.tickers.map((ticker) => ticker.ticker).join(','),
          sentAt,
        );
      }
    });

    insertAll(articles);
  }

  prune(olderThanDays: number): void {
    const cutoff = new Date(this.now().getTime() - olderThanDays * MILLIS_PER_DAY).toISOString();
    this.database.prepare('DELETE FROM sent_articles WHERE sent_at < ?').run(cutoff);
  }

  close(): void {
    this.database.close();
  }
}
