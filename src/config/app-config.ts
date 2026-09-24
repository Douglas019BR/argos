import { z } from 'zod';

import type { Ticker } from '../domain/ticker.js';

const tickerSchema = z.object({
  ticker: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
});

export const tickersFileSchema = z.object({
  tickers: z.array(tickerSchema).min(1),
});

const feedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  perTicker: z.boolean().default(false),
});

export const feedsFileSchema = z.object({
  feeds: z.array(feedSchema).min(1),
});

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

export const envSchema = z.object({
  WHATSAPP_GROUP_JID: z.string().min(1),
  WINDOW_HOURS: z.coerce.number().int().positive().default(5),
  CRON: z.string().min(1).default('0 */4 * * *'),
  DRY_RUN: booleanFromEnv,
  DATA_DIR: z.string().min(1).default('/data'),
  LOG_LEVEL: z.string().min(1).default('info'),
  TZ: z.string().min(1).default('America/Sao_Paulo'),
});

export type FeedConfig = z.infer<typeof feedSchema>;

export interface AppConfig {
  tickers: Ticker[];
  feeds: FeedConfig[];
  groupJid: string;
  windowHours: number;
  cron: string;
  dryRun: boolean;
  dataDir: string;
  logLevel: string;
  timezone: string;
}
