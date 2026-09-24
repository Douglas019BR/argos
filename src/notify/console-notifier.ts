import type { Logger } from '../logging/logger.js';
import type { Notifier } from './notifier.js';

/**
 * Notifier used in dry-run mode: logs the messages instead of sending them.
 */
export class ConsoleNotifier implements Notifier {
  constructor(private readonly logger: Logger) {}

  async start(): Promise<void> {
    this.logger.info('Dry run enabled: messages will be logged, not sent');
  }

  async send(to: string, message: string): Promise<void> {
    this.logger.info({ to, message }, 'Dry run message');
  }

  async stop(): Promise<void> {}
}
