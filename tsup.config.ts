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
  // Hook handler (ESM, called via `atrace hook` and legacy paths)
  {
    entry: ['src/collector/claude-code/hook-handler.ts'],
    format: ['esm'],
    external: ['better-sqlite3'],
    outDir: 'dist/collector/claude-code',
  },
  // Standalone hook handler — single CJS bundle copied to ~/.agent-trace/bin/.
  // Bundles ALL deps inline so it survives `npm rm -g` until self-heal.
  {
    entry: { 'standalone-handler': 'src/collector/claude-code/standalone-handler.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    external: ['better-sqlite3'],
    noExternal: [/^(?!better-sqlite3).*/],
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
  // Lifecycle modules — used by CLI commands and postinstall/preuninstall scripts.
  {
    entry: [
      'src/lifecycle/setup.ts',
      'src/lifecycle/uninstall.ts',
      'src/lifecycle/doctor.ts',
    ],
    format: ['esm'],
    external: ['better-sqlite3'],
    outDir: 'dist/lifecycle',
  },
]);
