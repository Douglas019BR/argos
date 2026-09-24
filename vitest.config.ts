import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/health.ts',
        'src/notify/baileys-notifier.ts',
        'src/notify/whatsapp-connection.ts',
        'src/notify/whatsapp-health.ts',
      ],
    },
  },
});
