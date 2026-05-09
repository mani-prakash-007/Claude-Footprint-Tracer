import { existsSync, copyFileSync, rmSync } from 'node:fs';
import {
  getBinDir,
  getHandlerPath,
  getSettingsPath,
  getStateDir,
} from './paths.js';
import {
  readSettings,
  writeSettings,
  removeAtraceHooks,
  listAtraceCommands,
  SettingsParseError,
} from './settings.js';
import { backupFile, latestBackupFor } from './backup.js';
import { isPkgAlive, readManifest, readSentinel } from './manifest.js';

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface Check {
  id: string;
  level: CheckLevel;
  message: string;
  fix?: () => void;
}

export interface DoctorReport {
  checks: Check[];
  okCount: number;
  warnCount: number;
  errorCount: number;
}

export async function doctor(opts: { fix?: boolean } = {}): Promise<DoctorReport> {
  const checks: Check[] = [];

  const manifest = readManifest();
  const sentinel = readSentinel();

  if (!manifest && !sentinel) {
    checks.push({
      id: 'no-manifest',
      level: 'warn',
      message: 'No atrace manifest. Either not installed or installed before manifest support.',
    });
  }

  if (sentinel && !isPkgAlive(sentinel)) {
    checks.push({
      id: 'pkg-stale',
      level: 'error',
      message: `Sentinel points to ${sentinel.pkgRoot} which no longer exists. Package was uninstalled but state remains.`,
      fix: () => {
        const handlerDir = getBinDir();
        if (existsSync(handlerDir)) rmSync(handlerDir, { recursive: true, force: true });
        const stateDir = getStateDir();
        if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
      },
    });
  }

  const handlerExists = existsSync(getHandlerPath());
  if (sentinel && isPkgAlive(sentinel) && !handlerExists) {
    checks.push({
      id: 'handler-missing',
      level: 'error',
      message: `Handler missing at ${getHandlerPath()} though package is alive. Re-run \`atrace setup --force\` to repair.`,
    });
  }

  for (const scope of ['user', 'project'] as const) {
    const path = getSettingsPath(scope);
    if (!existsSync(path)) continue;
    let settings;
    try {
      settings = readSettings(path);
    } catch (err) {
      if (err instanceof SettingsParseError) {
        checks.push({
          id: `settings-corrupt-${scope}`,
          level: 'error',
          message: err.message,
          fix: () => {
            const backup = latestBackupFor(path);
            if (backup) {
              backupFile(path);
              copyFileSync(backup, path);
            }
          },
        });
        continue;
      }
      throw err;
    }
    const cmds = listAtraceCommands(settings);
    for (const cmd of cmds) {
      const target = extractHandlerPath(cmd);
      if (target && !existsSync(target)) {
        checks.push({
          id: `stale-hook-${scope}`,
          level: 'error',
          message: `Hook in ${path} points to missing handler: ${target}`,
          fix: () => {
            const { next } = removeAtraceHooks(settings);
            backupFile(path);
            writeSettings(path, next);
          },
        });
      }
    }
  }

  if (opts.fix) {
    for (const c of checks) {
      if (c.level !== 'error') continue;
      try {
        c.fix?.();
        c.message += ' [fixed]';
        c.level = 'ok';
      } catch (err) {
        c.message += ` [fix failed: ${(err as Error).message}]`;
      }
    }
  }

  if (checks.length === 0) {
    checks.push({ id: 'all-ok', level: 'ok', message: 'No issues detected.' });
  }

  return {
    checks,
    okCount: checks.filter((c) => c.level === 'ok').length,
    warnCount: checks.filter((c) => c.level === 'warn').length,
    errorCount: checks.filter((c) => c.level === 'error').length,
  };
}

function extractHandlerPath(command: string): string | null {
  const m = command.match(/^node\s+("([^"]+)"|(\S+))/);
  if (!m) return null;
  return m[2] ?? m[3] ?? null;
}
