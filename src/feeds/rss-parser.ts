export interface ParsedFeedItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
}

export interface ParsedFeed {
  items: ParsedFeedItem[];
}

export interface RssParser {
  parseURL(url: string): Promise<ParsedFeed>;
}
