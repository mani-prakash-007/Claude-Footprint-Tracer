import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDbPath } from './paths.js';
import { runMigrations } from './migrations/index.js';

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? getDbPath();

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -8000');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}
