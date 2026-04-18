import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library (SDK wrapper API)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@anthropic-ai/sdk', 'better-sqlite3', 'react', 'ink'],
  },
  // CLI + TUI
  {
    entry: ['src/cli.tsx'],
    format: ['esm'],
    external: ['better-sqlite3', 'react', 'ink', 'meow'],
    outDir: 'dist',
  },
  // Hook handler (must be standalone, fast startup)
  {
    entry: ['src/collector/claude-code/hook-handler.ts'],
    format: ['esm'],
    external: ['better-sqlite3'],
    outDir: 'dist/collector/claude-code',
  },
]);
