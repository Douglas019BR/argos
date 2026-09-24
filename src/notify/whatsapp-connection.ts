import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';

import type { Logger } from '../logging/logger.js';

/**
 * Opens a Baileys socket bound to the persisted multi-file session and wires
 * credential persistence. Shared by the notifier and the health checker.
 */
export async function openWhatsAppSocket(sessionDir: string, logger: Logger): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({ version, auth: state, logger });

  socket.ev.on('creds.update', saveCreds);

  return socket;
}
