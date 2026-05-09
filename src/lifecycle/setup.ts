import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getBinDir,
  getHandlerPath,
  getSettingsPath,
  getHookCommand,
  getStateDir,
  type Scope,
} from './paths.js';
import { atomicCopy } from './atomic.js';
import {
  readSettings,
  writeSettings,
  addAtraceHooks,
  countAtraceHooks,
  SettingsParseError,
} from './settings.js';
import { backupFile } from './backup.js';
import { writeManifest, writeSentinel, type Manifest } from './manifest.js';
import { jsonDiffSummary } from './diff.js';
import { confirm } from './prompt.js';
import { detectClaudeCode } from './detect.js';

export interface SetupOptions {
  scope?: Scope;
  yes?: boolean;
  dryRun?: boolean;
  force?: boolean;
  pkgVersion?: string;
  pkgRoot?: string;
  handlerSource?: string;
}

export interface SetupResult {
  status: 'installed' | 'unchanged' | 'aborted' | 'dry-run';
  scope: Scope;
  settingsPath: string;
  handlerPath: string;
  backupPath?: string;
  message?: string;
}

export async function setup(opts: SetupOptions = {}): Promise<SetupResult> {
  const scope: Scope = opts.scope ?? 'user';
  const yes = opts.yes ?? false;
  const dryRun = opts.dryRun ?? false;
  const force = opts.force ?? false;
  const settingsPath = getSettingsPath(scope);
  const handlerPath = getHandlerPath();

  const detection = detectClaudeCode();
  if (!detection.found) {
    const proceed = yes
      ? false
      : await confirm(`Claude Code not detected (${detection.reason}). Continue anyway?`, false);
    if (!proceed) {
      return {
        status: 'aborted',
        scope,
        settingsPath,
        handlerPath,
        message: `Claude Code not detected. ${detection.reason}.`,
      };
    }
  }

  let before: ReturnType<typeof readSettings>;
  try {
    before = readSettings(settingsPath);
  } catch (err) {
    if (err instanceof SettingsParseError) {
      const backupPath = backupFile(settingsPath);
      throw new Error(
        `Cannot install: ${settingsPath} is not valid JSON. ` +
          `Raw bytes preserved at ${backupPath}. Fix the file and re-run \`atrace setup\`.`,
      );
    }
    throw err;
  }

  const command = getHookCommand();
  const after = addAtraceHooks(before, command);

  const beforeStr = JSON.stringify(before);
  const afterStr = JSON.stringify(after);
  const noChange = beforeStr === afterStr && existsSync(handlerPath) && !force;

  if (noChange) {
    return {
      status: 'unchanged',
      scope,
      settingsPath,
      handlerPath,
      message: 'Already installed; nothing to do. Use --force to rewrite.',
    };
  }

  if (dryRun) {
    process.stdout.write('--- Settings diff ---\n');
    process.stdout.write(jsonDiffSummary(before, after) + '\n');
    process.stdout.write(`Hook handler -> ${handlerPath}\n`);
    return { status: 'dry-run', scope, settingsPath, handlerPath };
  }

  if (!yes) {
    process.stdout.write(`atrace setup will modify: ${settingsPath}\n`);
    process.stdout.write(jsonDiffSummary(before, after) + '\n');
    process.stdout.write(`Will copy hook handler to: ${handlerPath}\n`);
    const ok = await confirm('Proceed?', true);
    if (!ok) {
      return { status: 'aborted', scope, settingsPath, handlerPath, message: 'User declined.' };
    }
  }

  const backupPath = backupFile(settingsPath) ?? undefined;
  const writtenFiles: string[] = [];

  try {
    mkdirSync(getStateDir(), { recursive: true });
    mkdirSync(getBinDir(), { recursive: true });

    const handlerSrc = opts.handlerSource ?? defaultHandlerSource();
    if (!existsSync(handlerSrc)) {
      throw new Error(
        `Hook handler source missing at ${handlerSrc}. Did the build complete? ` +
          `Run \`npm run build\` and try again.`,
      );
    }
    atomicCopy(handlerSrc, handlerPath, 0o755);
    writtenFiles.push(handlerPath);

    writeSettings(settingsPath, after);
    writtenFiles.push(settingsPath);

    const manifest: Manifest = {
      version: 1,
      pkgVersion: opts.pkgVersion ?? readPkgVersion(),
      installedAt: new Date().toISOString(),
      scope,
      files: [
        { path: handlerPath, kind: 'handler' },
        { path: settingsPath, kind: 'settings' },
      ],
      settingsTouched: [settingsPath],
    };
    writeManifest(manifest);

    writeSentinel({
      pkgVersion: manifest.pkgVersion,
      pkgRoot: opts.pkgRoot ?? defaultPkgRoot(),
      writtenAt: manifest.installedAt,
    });

    const count = countAtraceHooks(after);
    return {
      status: 'installed',
      scope,
      settingsPath,
      handlerPath,
      backupPath,
      message: `Registered ${count} hook entries; handler at ${handlerPath}.`,
    };
  } catch (err) {
    if (backupPath && existsSync(backupPath)) {
      try {
        copyFileSync(backupPath, settingsPath);
      } catch {
        // best-effort rollback
      }
    }
    throw err;
  }
}

function findPkgRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkg = resolve(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const data = JSON.parse(readFileSync(pkg, 'utf-8')) as { name?: string };
        if (data.name === 'claude-atrace') return dir;
      } catch {
        // continue walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function defaultHandlerSource(): string {
  const root = findPkgRoot();
  if (root) return resolve(root, 'dist', 'standalone-handler.cjs');
  // Fallback for unbundled dev runs (`tsx src/cli.tsx`).
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), '..', 'standalone-handler.cjs');
}

function defaultPkgRoot(): string {
  return findPkgRoot() ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function readPkgVersion(): string {
  try {
    const root = findPkgRoot();
    if (!root) return '0.0.0';
    const data = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return String(data.version ?? '0.0.0');
  } catch {
    return '0.0.0';
  }
}
