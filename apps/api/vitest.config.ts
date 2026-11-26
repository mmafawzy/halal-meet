import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use @halal-meet/core from source so contract changes need no rebuild (same as tsconfig paths).
  resolve: { alias: { '@halal-meet/core': path.resolve(__dirname, '../../packages/core/src/index.ts') } },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
