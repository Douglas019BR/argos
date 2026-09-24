export interface Notifier {
  /** Prepares the transport (e.g. opens the WhatsApp connection). */
  start(): Promise<void>;
  /** Sends a text message to the given destination. */
  send(to: string, message: string): Promise<void>;
  /** Releases the transport resources. */
  stop(): Promise<void>;
}
