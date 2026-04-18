import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_DIR = join(homedir(), '.agent-trace');
const DB_FILE = 'traces.db';

export function getDbPath(): string {
  return process.env.AGENT_TRACE_DB ?? join(DATA_DIR, DB_FILE);
}

export function getDataDir(): string {
  return DATA_DIR;
}
