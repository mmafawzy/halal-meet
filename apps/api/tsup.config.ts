import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/main.ts', seed: 'src/seed/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Bundle the workspace core package from source (resolved through tsconfig paths).
  noExternal: ['@halal-meet/core'],
  // Nest relies on legacy decorators; esbuild reads `experimentalDecorators` from tsconfig.
});
