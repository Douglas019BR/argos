import { mkdirSync } from 'node:fs';

import { DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

import type { Logger } from '../logging/logger.js';
import type { Notifier } from './notifier.js';
import { openWhatsAppSocket } from './whatsapp-connection.js';

const RECONNECT_DELAY_MS = 5_000;
const DEFAULT_SEND_DELAY_MS = 1_500;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function statusCodeFrom(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

/**
 * Sends messages over WhatsApp using Baileys and a persisted multi-file session.
 * Thin adapter: connection lifecycle only, no business logic.
 */
export class BaileysNotifier implements Notifier {
  private socket: WASocket | null = null;
  private readonly connectionOpened: Promise<void>;
  private resolveOpened!: () => void;
  private rejectOpened!: (error: Error) => void;

  constructor(
    private readonly sessionDir: string,
    private readonly logger: Logger,
    private readonly sendDelayMs = DEFAULT_SEND_DELAY_MS,
  ) {
    this.connectionOpened = new Promise((resolve, reject) => {
      this.resolveOpened = resolve;
      this.rejectOpened = reject;
    });
  }

  async start(): Promise<void> {
    mkdirSync(this.sessionDir, { recursive: true });
    await this.connect();
    await this.connectionOpened;
  }

  async send(to: string, message: string): Promise<void> {
    if (this.socket === null) {
      throw new Error('BaileysNotifier is not started');
    }

    await this.socket.sendMessage(to, { text: message });
    await delay(this.sendDelayMs);
  }

  async stop(): Promise<void> {
    await this.socket?.end(undefined);
    this.socket = null;
  }

  private async connect(): Promise<void> {
    const socket = await openWhatsAppSocket(this.sessionDir, this.logger);

    this.socket = socket;
    socket.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
  }

  private handleConnectionUpdate(update: {
    connection?: string;
    qr?: string;
    lastDisconnect?: { error?: unknown };
  }): void {
    if (update.qr !== undefined) {
      qrcode.generate(update.qr, { small: true });
      this.logger.info('Scan the QR code above to link the WhatsApp account');
    }

    if (update.connection === 'open') {
      this.logger.info('Connected to WhatsApp');
      this.resolveOpened();
      return;
    }

    if (update.connection === 'close') {
      this.handleClose(statusCodeFrom(update.lastDisconnect?.error));
    }
  }

  private handleClose(statusCode: number | undefined): void {
    if (statusCode === DisconnectReason.loggedOut) {
      this.logger.error('WhatsApp session logged out; a new QR scan is required');
      this.rejectOpened(new Error('WhatsApp session logged out'));
      return;
    }

    this.logger.warn({ statusCode }, 'WhatsApp connection closed, reconnecting');
    void delay(RECONNECT_DELAY_MS).then(() => this.connect());
  }
}
