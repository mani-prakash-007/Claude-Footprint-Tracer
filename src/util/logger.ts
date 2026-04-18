import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from '../storage/paths.js';

const LOG_FILE = join(getDataDir(), 'debug.log');
let initialized = false;

function ensureLogDir() {
  if (initialized) return;
  mkdirSync(getDataDir(), { recursive: true });
  initialized = true;
}

export function debug(msg: string, ...args: unknown[]): void {
  if (!process.env.AGENT_TRACE_DEBUG) return;
  ensureLogDir();
  const line = `[${new Date().toISOString()}] ${msg} ${args.map((a) => JSON.stringify(a)).join(' ')}\n`;
  appendFileSync(LOG_FILE, line);
}
