import type { Article } from '../domain/article.js';
import type { Logger } from '../logging/logger.js';
import { stripHtml } from '../text/normalize.js';
import { parseDate } from '../time/parse-date.js';
import type { FeedSource } from './feed-source.js';
import type { ParsedFeedItem, RssParser } from './rss-parser.js';

/**
 * A {@link FeedSource} backed by an RSS/Atom URL.
 * Covers every feed, including Google News, via URL templating done by the factory.
 */
export class RssFeedSource implements FeedSource {
  constructor(
    public readonly name: string,
    public readonly url: string,
    private readonly parser: RssParser,
    private readonly logger: Logger,
  ) {}

  async fetchArticles(): Promise<Article[]> {
    try {
      const feed = await this.parser.parseURL(this.url);
      return feed.items
        .map((item) => this.toArticle(item))
        .filter((article): article is Article => article !== null);
    } catch (error) {
      this.logger.warn({ err: error, feed: this.name }, 'Failed to fetch feed');
      return [];
    }
  }

  private toArticle(item: ParsedFeedItem): Article | null {
    if (item.title === undefined || item.link === undefined) {
      return null;
    }

    const publishedAt = parseDate(item.pubDate) ?? parseDate(item.isoDate);

    if (publishedAt === null) {
      return null;
    }

    return {
      title: item.title.trim(),
      link: item.link,
      description: stripHtml(item.contentSnippet ?? item.content ?? ''),
      publishedAt,
      source: this.name,
    };
  }
}
