import { defineConfig } from 'vite';

// Placeholder; the full multi-page config is added once the app exists.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
