import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getHomeDir } from './paths.js';

export function detectClaudeCode(): { found: boolean; reason: string } {
  const claudeDir = join(getHomeDir(), '.claude');
  if (existsSync(claudeDir)) {
    return { found: true, reason: `${claudeDir} exists` };
  }
  if (onPath('claude')) {
    return { found: true, reason: '`claude` binary on PATH' };
  }
  return { found: false, reason: 'no ~/.claude dir and no `claude` on PATH' };
}

function onPath(bin: string): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
