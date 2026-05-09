import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

export type Scope = 'user' | 'project';

function effectiveHome(): string {
  // When running under `sudo`, `homedir()` returns root's home. Try to
  // recover the calling user's real home so hooks land where Claude Code
  // actually runs.
  if (
    process.platform !== 'win32' &&
    typeof process.getuid === 'function' &&
    process.getuid() === 0 &&
    process.env.SUDO_USER
  ) {
    try {
      const out = execFileSync('getent', ['passwd', process.env.SUDO_USER], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const parts = out.split(':');
      if (parts.length >= 6 && parts[5]) return parts[5];
    } catch {
      // getent missing (e.g. macOS) — fall through to platform default.
    }
    if (process.platform === 'darwin') return `/Users/${process.env.SUDO_USER}`;
    return `/home/${process.env.SUDO_USER}`;
  }
  return homedir();
}

export function getHomeDir(): string {
  return effectiveHome();
}

export function getDataDir(): string {
  if (process.env.AGENT_TRACE_HOME) return process.env.AGENT_TRACE_HOME;
  return join(getHomeDir(), '.agent-trace');
}

export function getBinDir(): string {
  return join(getDataDir(), 'bin');
}

export function getStateDir(): string {
  return join(getDataDir(), 'state');
}

export function getBackupDir(): string {
  return getStateDir();
}

export function getHandlerPath(): string {
  return join(getBinDir(), 'hook-handler.cjs');
}

export function getManifestPath(): string {
  return join(getStateDir(), 'manifest.json');
}

export function getSentinelPath(): string {
  return join(getStateDir(), 'alive');
}

export function getSettingsPath(scope: Scope): string {
  if (scope === 'user') return join(getHomeDir(), '.claude', 'settings.json');
  return join(process.cwd(), '.claude', 'settings.json');
}

export function getHookCommand(): string {
  return `node ${quoteIfNeeded(getHandlerPath())}`;
}

function quoteIfNeeded(p: string): string {
  return p.includes(' ') ? `"${p}"` : p;
}
