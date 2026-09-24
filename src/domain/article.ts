import type { Ticker } from './ticker.js';

export interface Article {
  title: string;
  link: string;
  description: string;
  publishedAt: Date;
  source: string;
}

export interface MatchedArticle extends Article {
  tickers: Ticker[];
}
