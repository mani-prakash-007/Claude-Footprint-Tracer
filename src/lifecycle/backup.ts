import { existsSync, copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getStateDir } from './paths.js';

const KEEP = 5;
const PREFIX = 'settings.backup.';

export function backupFile(path: string): string | null {
  if (!existsSync(path)) return null;
  const dir = getStateDir();
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(dir, `${PREFIX}${ts}.${basename(path)}.json`);
  copyFileSync(path, dest);
  rotate(dir);
  return dest;
}

function rotate(dir: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir)
    .filter((n) => n.startsWith(PREFIX))
    .map((n) => ({ name: n, mtime: safeMtime(join(dir, n)) }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const e of entries.slice(KEEP)) {
    try {
      unlinkSync(join(dir, e.name));
    } catch {
      // best-effort
    }
  }
}

function safeMtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

export function listBackups(): string[] {
  const dir = getStateDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.startsWith(PREFIX))
    .map((n) => join(dir, n))
    .sort();
}

export function latestBackupFor(originalPath: string): string | null {
  const target = `.${basename(originalPath)}.json`;
  const matches = listBackups().filter((p) => p.endsWith(target));
  if (matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}
