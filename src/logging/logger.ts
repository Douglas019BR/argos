import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * Creates the shared application logger.
 */
export function createLogger(level: string): Logger {
  return pino({ level });
}
