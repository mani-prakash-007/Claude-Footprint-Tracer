import { join } from 'node:path';
import { getDataDir as getLifecycleDataDir } from '../lifecycle/paths.js';

const DB_FILE = 'traces.db';

export function getDbPath(): string {
  return process.env.AGENT_TRACE_DB ?? join(getLifecycleDataDir(), DB_FILE);
}

export function getDataDir(): string {
  return getLifecycleDataDir();
}
