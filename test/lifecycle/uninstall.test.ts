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
  const mod = await import('../../src/lifecycle/setup.js?ts=' + Date.now());
  return mod.setup;
}
async function freshUninstall() {
  const mod = await import('../../src/lifecycle/uninstall.js?ts=' + Date.now());
  return mod.uninstall;
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

describe('uninstall()', () => {
  it('removes hooks installed by setup, leaves unrelated hooks', async () => {
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

    const uninstall = await freshUninstall();
    const result = await uninstall({ yes: true });
    expect(result.removedHookEntries).toBe(4);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const pre = settings.hooks?.PreToolUse ?? [];
    expect(pre.length).toBe(1);
    expect(pre[0].hooks[0].command).toContain('other-tool');
  });

  it('removes ~/.agent-trace/bin and state', async () => {
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    expect(existsSync(join(tmpHome, '.agent-trace', 'bin'))).toBe(true);

    const uninstall = await freshUninstall();
    await uninstall({ yes: true });
    expect(existsSync(join(tmpHome, '.agent-trace', 'bin'))).toBe(false);
    expect(existsSync(join(tmpHome, '.agent-trace', 'state', 'alive'))).toBe(false);
  });

  it('preserves traces.db when --purge is not set', async () => {
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    const dbPath = join(tmpHome, '.agent-trace', 'traces.db');
    writeFileSync(dbPath, 'fake db bytes');

    const uninstall = await freshUninstall();
    await uninstall({ yes: true });
    expect(existsSync(dbPath)).toBe(true);
  });

  it('purges everything when --purge is set', async () => {
    const setup = await freshSetup();
    await setup({ scope: 'user', yes: true, handlerSource: handlerSrc, pkgRoot: tmpHome });
    writeFileSync(join(tmpHome, '.agent-trace', 'traces.db'), 'fake db bytes');

    const uninstall = await freshUninstall();
    await uninstall({ yes: true, purge: true });
    expect(existsSync(join(tmpHome, '.agent-trace'))).toBe(false);
  });

  it('is idempotent', async () => {
    const uninstall = await freshUninstall();
    const r1 = await uninstall({ yes: true });
    const r2 = await uninstall({ yes: true });
    expect(r1.status).toBe('noop');
    expect(r2.status).toBe('noop');
  });
});
