#!/usr/bin/env node
// agent-trace npm preuninstall — best-effort cleanup. npm often skips this
// for global packages, so the standalone hook handler also self-heals.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  if (process.env.npm_config_global !== 'true') return;

  const distUninstall = path.resolve(__dirname, '..', 'dist', 'lifecycle', 'uninstall.js');
  let uninstall;
  try {
    ({ uninstall } = await import(pathToFileURL(distUninstall).href));
  } catch {
    return;
  }
  try {
    await uninstall({ yes: true });
    process.stdout.write('[agent-trace] hooks removed.\n');
  } catch (err) {
    process.stdout.write(`[agent-trace] preuninstall: ${err.message} (handler will self-heal on next Claude run).\n`);
  }
}

run().catch(() => process.exit(0));
