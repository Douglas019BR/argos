import cron, { type ScheduledTask } from 'node-cron';

import type { Logger } from '../logging/logger.js';

/**
 * Runs a job on a cron expression, guarding against overlapping executions.
 * A failing run is logged and never crashes the service.
 */
export class Scheduler {
  private scheduledTask: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly expression: string,
    private readonly job: () => Promise<void>,
    private readonly logger: Logger,
    private readonly timezone: string,
  ) {}

  start(): void {
    this.scheduledTask = cron.schedule(this.expression, () => void this.run(), {
      timezone: this.timezone,
    });
    this.logger.info({ expression: this.expression, timezone: this.timezone }, 'Scheduler started');
  }

  stop(): void {
    this.scheduledTask?.stop();
    this.scheduledTask = null;
  }

  private async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous run still in progress, skipping this tick');
      return;
    }

    this.isRunning = true;

    try {
      await this.job();
    } catch (error) {
      this.logger.error({ err: error }, 'Scheduled run failed');
    } finally {
      this.isRunning = false;
    }
  }
}
