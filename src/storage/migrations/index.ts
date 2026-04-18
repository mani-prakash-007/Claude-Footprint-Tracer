import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  { version: 1, file: '001_initial.sql' },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = db
    .prepare('SELECT version FROM schema_version')
    .all() as { version: number }[];
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue;

    const sql = readFileSync(join(__dirname, migration.file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      Date.now()
    );
  }
}
