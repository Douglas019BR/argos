import type { FeedConfig } from '../config/app-config.js';
import type { Ticker } from '../domain/ticker.js';
import type { Logger } from '../logging/logger.js';
import type { FeedSource } from './feed-source.js';
import { RssFeedSource } from './rss-feed-source.js';
import type { RssParser } from './rss-parser.js';

const TICKER_PLACEHOLDER = '{ticker}';

/**
 * Builds one {@link FeedSource} per feed, expanding per-ticker feeds into one
 * source per ticker with the `{ticker}` placeholder substituted.
 */
export class FeedSourceFactory {
  constructor(
    private readonly parser: RssParser,
    private readonly logger: Logger,
  ) {}

  create(feeds: FeedConfig[], tickers: Ticker[]): FeedSource[] {
    return feeds.flatMap((feed) =>
      feed.perTicker
        ? tickers.map((ticker) => this.createPerTickerSource(feed, ticker))
        : [new RssFeedSource(feed.name, feed.url, this.parser, this.logger)],
    );
  }

  private createPerTickerSource(feed: FeedConfig, ticker: Ticker): FeedSource {
    const url = feed.url.replaceAll(TICKER_PLACEHOLDER, ticker.ticker);
    return new RssFeedSource(`${feed.name} (${ticker.ticker})`, url, this.parser, this.logger);
  }
}
