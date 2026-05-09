// Standalone hook handler bundled into a single CJS file by tsup.
// Lives at ~/.agent-trace/bin/hook-handler.cjs after `atrace setup`.
//
// Two responsibilities:
//   1. Self-heal: if the parent npm package is gone, strip own settings
//      entries + remove bin/state, exit 0.
//   2. Delegate: when alive, fork the in-package hook-handler.js (which can
//      see the package's node_modules and load better-sqlite3 natively).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isStale, readSentinelRaw, salvageAll } from '../../lifecycle/self-heal.js';

async function main(): Promise<void> {
  const sentinel = readSentinelRaw();
  if (isStale(sentinel)) {
    try {
      for await (const _ of process.stdin) {
        void _;
      }
    } catch {
      // ignore
    }
    salvageAll();
    process.stdout.write('{}');
    process.exit(0);
  }

  if (!sentinel) {
    // No sentinel: somebody dropped this file here without setup. Exit clean.
    process.stdout.write('{}');
    process.exit(0);
  }

  const inPkgHandler = join(
    sentinel.pkgRoot,
    'dist',
    'collector',
    'claude-code',
    'hook-handler.js',
  );
  if (!existsSync(inPkgHandler)) {
    // Package present but handler missing — treat like stale.
    try {
      for await (const _ of process.stdin) {
        void _;
      }
    } catch {
      // ignore
    }
    salvageAll();
    process.stdout.write('{}');
    process.exit(0);
  }

  // Delegate. Pipe stdio through unchanged so Claude Code sees normal IO.
  const child = spawn(process.execPath, [inPkgHandler], {
    stdio: 'inherit',
    windowsHide: true,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
  child.on('error', () => {
    process.stdout.write('{}');
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`agent-trace hook error: ${(err as Error).message}\n`);
  process.stdout.write('{}');
  process.exit(0);
});
