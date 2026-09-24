import { join } from 'node:path';

import { createLogger } from './logging/logger.js';
import { WhatsAppHealthChecker, type WhatsAppHealth } from './notify/whatsapp-health.js';

const EXIT_CODES: Record<WhatsAppHealth, number> = {
  connected: 0,
  'needs-auth': 2,
  'no-session': 2,
  unknown: 1,
};

async function main(): Promise<void> {
  const dataDir = process.env.DATA_DIR ?? '/data';
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const logger = createLogger(logLevel);

  const status = await new WhatsAppHealthChecker(join(dataDir, 'session'), logger).check();
  console.log(`WhatsApp status: ${status}`);

  process.exit(EXIT_CODES[status]);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
