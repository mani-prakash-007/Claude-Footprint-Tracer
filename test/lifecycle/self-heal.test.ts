import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIG_HOME = process.env.HOME;
const ORIG_USERPROFILE = process.env.USERPROFILE;
const ORIG_TRACE_HOME = process.env.AGENT_TRACE_HOME;

let tmpHome: string;

async function freshSelfHeal() {
  const mod = await import('../../src/lifecycle/self-heal.js?ts=' + Date.now());
  return mod;
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'atrace-test-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.env.AGENT_TRACE_HOME = join(tmpHome, '.agent-trace');
});

afterEach(() => {
  if (ORIG_HOME) process.env.HOME = ORIG_HOME;
  else delete process.env.HOME;
  if (ORIG_USERPROFILE) process.env.USERPROFILE = ORIG_USERPROFILE;
  else delete process.env.USERPROFILE;
  if (ORIG_TRACE_HOME) process.env.AGENT_TRACE_HOME = ORIG_TRACE_HOME;
  else delete process.env.AGENT_TRACE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('self-heal', () => {
  it('isStale returns true when sentinel pkgRoot does not exist', async () => {
    const { isStale } = await freshSelfHeal();
    expect(isStale({ pkgRoot: join(tmpHome, 'gone') })).toBe(true);
  });

  it('isStale returns false when sentinel pkgRoot exists', async () => {
    const { isStale } = await freshSelfHeal();
    expect(isStale({ pkgRoot: tmpHome })).toBe(false);
  });

  it('isStale returns false when sentinel is null', async () => {
    const { isStale } = await freshSelfHeal();
    expect(isStale(null)).toBe(false);
  });

  it('salvageSettingsFile removes only agent-trace entries', async () => {
    const settingsPath = join(tmpHome, '.claude', 'settings.json');
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: '*', hooks: [{ type: 'command', command: 'node /a/agent-trace/x.js' }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /b/other.js' }] },
          ],
          PostToolUse: [
            { matcher: '*', hooks: [{ type: 'command', command: 'node /a/agent-trace/x.js' }] },
          ],
        },
      }),
    );

    const { salvageSettingsFile } = await freshSelfHeal();
    const removed = salvageSettingsFile(settingsPath);
    expect(removed).toBe(2);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('other.js');
    expect(settings.hooks.PostToolUse).toBeUndefined();
  });

  it('salvageAll removes bin and state dirs', async () => {
    const dataDir = join(tmpHome, '.agent-trace');
    mkdirSync(join(dataDir, 'bin'), { recursive: true });
    mkdirSync(join(dataDir, 'state'), { recursive: true });
    writeFileSync(join(dataDir, 'bin', 'hook-handler.cjs'), '#!/usr/bin/env node\n');
    writeFileSync(join(dataDir, 'state', 'alive'), '{}');

    const { salvageAll } = await freshSelfHeal();
    const result = salvageAll();
    expect(result.dirsRemoved.length).toBe(2);
    expect(existsSync(join(dataDir, 'bin'))).toBe(false);
    expect(existsSync(join(dataDir, 'state'))).toBe(false);
  });

  it('salvageSettingsFile is a no-op on missing or empty file', async () => {
    const { salvageSettingsFile } = await freshSelfHeal();
    expect(salvageSettingsFile(join(tmpHome, 'nope.json'))).toBe(0);
  });
});
