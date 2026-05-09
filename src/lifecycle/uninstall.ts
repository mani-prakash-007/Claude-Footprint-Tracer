import { existsSync, rmSync } from 'node:fs';
import {
  getBinDir,
  getDataDir,
  getManifestPath,
  getSentinelPath,
  getSettingsPath,
} from './paths.js';
import { readSettings, writeSettings, removeAtraceHooks, SettingsParseError } from './settings.js';
import { backupFile } from './backup.js';
import { readManifest } from './manifest.js';
import { confirm } from './prompt.js';
import type { Scope } from './paths.js';

export interface UninstallOptions {
  scope?: Scope;
  yes?: boolean;
  purge?: boolean;
}

export interface UninstallResult {
  status: 'removed' | 'noop';
  removedHookEntries: number;
  cleanedFiles: string[];
  preservedFiles: string[];
  settingsTouched: string[];
}

export async function uninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const yes = opts.yes ?? false;
  const purge = opts.purge ?? false;

  const manifest = readManifest();
  const settingsPaths = collectSettingsPaths(manifest, opts.scope);
  const cleanedFiles: string[] = [];
  const preservedFiles: string[] = [];
  let removedHookEntries = 0;

  if (!yes) {
    const summary = `Will remove atrace hooks from ${settingsPaths.length} settings file(s)` +
      (purge ? ' AND wipe ~/.agent-trace (DB, logs, traces).' : '.');
    process.stdout.write(summary + '\n');
    const ok = await confirm('Proceed?', true);
    if (!ok) {
      return {
        status: 'noop',
        removedHookEntries: 0,
        cleanedFiles: [],
        preservedFiles: [],
        settingsTouched: [],
      };
    }
  }

  for (const settingsPath of settingsPaths) {
    if (!existsSync(settingsPath)) continue;
    let settings;
    try {
      settings = readSettings(settingsPath);
    } catch (err) {
      if (err instanceof SettingsParseError) {
        process.stderr.write(`atrace uninstall: skipping unparseable ${settingsPath}\n`);
        continue;
      }
      throw err;
    }
    const { next, removed } = removeAtraceHooks(settings);
    if (removed === 0) continue;
    backupFile(settingsPath);
    writeSettings(settingsPath, next);
    removedHookEntries += removed;
  }

  const handlerDir = getBinDir();
  if (existsSync(handlerDir)) {
    rmSync(handlerDir, { recursive: true, force: true });
    cleanedFiles.push(handlerDir);
  }

  for (const p of [getManifestPath(), getSentinelPath()]) {
    if (existsSync(p)) {
      rmSync(p, { force: true });
      cleanedFiles.push(p);
    }
  }

  if (purge) {
    const dataDir = getDataDir();
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
      cleanedFiles.push(dataDir);
    }
  } else {
    const dataDir = getDataDir();
    if (existsSync(dataDir)) preservedFiles.push(dataDir);
  }

  return {
    status: removedHookEntries > 0 || cleanedFiles.length > 0 ? 'removed' : 'noop',
    removedHookEntries,
    cleanedFiles,
    preservedFiles,
    settingsTouched: settingsPaths,
  };
}

function collectSettingsPaths(
  manifest: ReturnType<typeof readManifest>,
  scopeOverride?: Scope,
): string[] {
  const paths = new Set<string>();
  if (manifest) {
    for (const p of manifest.settingsTouched) paths.add(p);
  }
  if (scopeOverride) {
    paths.add(getSettingsPath(scopeOverride));
  } else if (!manifest) {
    paths.add(getSettingsPath('user'));
    paths.add(getSettingsPath('project'));
  }
  return [...paths];
}
