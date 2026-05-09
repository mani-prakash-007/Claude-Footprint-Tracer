// Pure node-stdlib salvage logic, safe to run after the parent npm package
// has been deleted. Used by standalone-handler.ts and `atrace doctor --fix`.
import { existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  getBinDir,
  getHomeDir,
  getSentinelPath,
  getStateDir,
} from './paths.js';
import { HOOK_MARKER } from '../types/claude-settings.js';

export interface SentinelLite {
  pkgRoot: string;
  pkgVersion?: string;
}

export function readSentinelRaw(): SentinelLite | null {
  const path = getSentinelPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SentinelLite;
  } catch {
    return null;
  }
}

export function isStale(sentinel: SentinelLite | null): boolean {
  if (!sentinel) return false;
  if (!existsSync(sentinel.pkgRoot)) return true;
  try {
    statSync(sentinel.pkgRoot);
    return false;
  } catch {
    return true;
  }
}

export function salvageSettingsFile(path: string): number {
  if (!existsSync(path)) return 0;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return 0;
  }
  if (!raw.trim()) return 0;
  let parsed: { hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>; [k: string]: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!parsed.hooks) return 0;
  let removed = 0;
  const next: Record<string, unknown[]> = {};
  for (const [event, configs] of Object.entries(parsed.hooks)) {
    const before = configs.length;
    const kept = configs.filter(
      (c) => !c.hooks?.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_MARKER)),
    );
    removed += before - kept.length;
    if (kept.length > 0) next[event] = kept;
  }
  if (Object.keys(next).length === 0) {
    delete parsed.hooks;
  } else {
    parsed.hooks = next as typeof parsed.hooks;
  }
  try {
    writeFileSync(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // best-effort
  }
  return removed;
}

export function salvageAll(): { settingsTouched: number; dirsRemoved: string[] } {
  let settingsTouched = 0;
  for (const p of [
    join(getHomeDir(), '.claude', 'settings.json'),
    join(process.cwd(), '.claude', 'settings.json'),
  ]) {
    if (salvageSettingsFile(p) > 0) settingsTouched++;
  }
  const dirsRemoved: string[] = [];
  for (const dir of [getBinDir(), getStateDir()]) {
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        dirsRemoved.push(dir);
      } catch {
        // best-effort
      }
    }
  }
  return { settingsTouched, dirsRemoved };
}
