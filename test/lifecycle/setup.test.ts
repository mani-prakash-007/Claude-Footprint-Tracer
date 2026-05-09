import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIG_HOME = process.env.HOME;
const ORIG_USERPROFILE = process.env.USERPROFILE;
const ORIG_TRACE_HOME = process.env.AGENT_TRACE_HOME;

let tmpHome: string;
let handlerSrc: string;

async function freshSetup() {
  // bust ESM cache so paths.ts re-reads HOME on each test run
  const mod = await import('../../src/lifecycle/setup.js?ts=' + Date.now());
  return mod.setup;
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'atrace-test-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.env.AGENT_TRACE_HOME = join(tmpHome, '.agent-trace');
  handlerSrc = join(tmpHome, 'fake-handler.cjs');
  writeFileSync(handlerSrc, '#!/usr/bin/env node\nprocess.stdout.write("{}")\n');
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

describe('setup()', () => {
  it('creates settings.json with all 4 hook events when none exists', async () => {
    const setup = await freshSetup();
    const result = await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome, pkgVersion: '0.1.0' });
    expect(result.status).toBe('installed');

    const settingsPath = join(tmpHome, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(Object.keys(settings.hooks).sort()).toEqual([
      'PostToolUse',
      'PreToolUse',
      'Stop',
      'UserPromptSubmit',
    ]);
    for (const ev of Object.values(settings.hooks)) {
      const arr = ev as Array<{ hooks: Array<{ command: string }> }>;
      expect(arr[0].hooks[0].command).toContain('agent-trace');
    }
  });

  it('preserves unrelated hooks', async () => {
    const settingsPath = join(tmpHome, '.claude', 'settings.json');
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /usr/local/other-tool.js' }] },
          ],
        },
      }),
    );
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const pre = settings.hooks.PreToolUse;
    expect(pre.length).toBe(2);
    expect(pre.find((c: { hooks: Array<{ command: string }> }) =>
      c.hooks[0].command.includes('other-tool'),
    )).toBeTruthy();
    expect(pre.find((c: { hooks: Array<{ command: string }> }) =>
      c.hooks[0].command.includes('agent-trace'),
    )).toBeTruthy();
  });

  it('dedupes existing agent-trace entries (idempotent re-run)', async () => {
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome, force: true });

    const settings = JSON.parse(readFileSync(join(tmpHome, '.claude', 'settings.json'), 'utf-8'));
    for (const configs of Object.values(settings.hooks) as Array<unknown>[]) {
      const matches = (configs as Array<{ hooks: Array<{ command: string }> }>).filter((c) =>
        c.hooks[0].command.includes('agent-trace'),
      );
      expect(matches.length).toBe(1);
    }
  });

  it('dry-run writes nothing', async () => {
    const setup = await freshSetup();
    const result = await setup({
      scope: 'user',
      yes: true,
      dryRun: true,
      handlerSource: handlerSrc,
      pkgRoot: tmpHome,
    });
    expect(result.status).toBe('dry-run');
    expect(existsSync(join(tmpHome, '.claude', 'settings.json'))).toBe(false);
  });

  it('throws on corrupt settings.json without overwriting', async () => {
    const settingsPath = join(tmpHome, '.claude', 'settings.json');
    mkdirSync(join(tmpHome, '.claude'), { recursive: true });
    writeFileSync(settingsPath, '{not valid json');

    const setup = await freshSetup();
    await expect(
      setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome }),
    ).rejects.toThrow(/not valid JSON/);

    expect(readFileSync(settingsPath, 'utf-8')).toBe('{not valid json');
  });

  it('returns unchanged on second run with no changes', async () => {
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    const r2 = await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    expect(r2.status).toBe('unchanged');
  });

  it('writes manifest and sentinel', async () => {
    const setup = await freshSetup();
    await setup({
      scope: 'user',
      yes: true,
      handlerSource: handlerSrc,
      pkgRoot: tmpHome,
      pkgVersion: '9.9.9',
    });
    const stateDir = join(tmpHome, '.agent-trace', 'state');
    expect(existsSync(join(stateDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(stateDir, 'alive'))).toBe(true);
    const sentinel = JSON.parse(readFileSync(join(stateDir, 'alive'), 'utf-8'));
    expect(sentinel.pkgVersion).toBe('9.9.9');
  });
});
