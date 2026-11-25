import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', seed: 'src/seed/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Nest relies on legacy decorators; esbuild reads `experimentalDecorators` from tsconfig.
});
