import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { DisconnectReason, type WASocket } from '@whiskeysockets/baileys';

import type { Logger } from '../logging/logger.js';
import { openWhatsAppSocket } from './whatsapp-connection.js';

export type WhatsAppHealth = 'connected' | 'needs-auth' | 'no-session' | 'unknown';

const CREDS_FILE = 'creds.json';
const DEFAULT_TIMEOUT_MS = 20_000;

function statusCodeFrom(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

/**
 * Probes the WhatsApp session and reports whether it is still usable.
 *
 * Opens a short-lived connection: `open` means healthy, a QR prompt or a
 * `loggedOut` close means the session must be linked again. Run it while the
 * service is stopped — two sockets sharing a session would disconnect each other.
 */
export class WhatsAppHealthChecker {
  constructor(
    private readonly sessionDir: string,
    private readonly logger: Logger,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async check(): Promise<WhatsAppHealth> {
    if (!existsSync(join(this.sessionDir, CREDS_FILE))) {
      return 'no-session';
    }

    const socket = await openWhatsAppSocket(this.sessionDir, this.logger);

    try {
      return await this.waitForStatus(socket);
    } finally {
      await socket.end(undefined);
    }
  }

  private waitForStatus(socket: WASocket): Promise<WhatsAppHealth> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('unknown'), this.timeoutMs);
      const finish = (status: WhatsAppHealth): void => {
        clearTimeout(timer);
        resolve(status);
      };

      socket.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
          finish('connected');
          return;
        }

        if (update.qr !== undefined) {
          finish('needs-auth');
          return;
        }

        if (update.connection === 'close') {
          const loggedOut =
            statusCodeFrom(update.lastDisconnect?.error) === DisconnectReason.loggedOut;
          finish(loggedOut ? 'needs-auth' : 'unknown');
        }
      });
    });
  }
}
