import { existsSync, readFileSync } from 'node:fs';
import { atomicWrite } from './atomic.js';
import {
  HOOK_EVENTS,
  HOOK_MARKER,
  HOOK_TIMEOUT_MS,
  type ClaudeSettings,
  type HookConfig,
} from '../types/claude-settings.js';

export class SettingsParseError extends Error {
  constructor(public path: string, public cause: unknown) {
    super(`Failed to parse Claude settings at ${path}: ${(cause as Error).message ?? cause}`);
    this.name = 'SettingsParseError';
  }
}

export function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as ClaudeSettings;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings.json must be a JSON object');
    }
    return parsed;
  } catch (err) {
    throw new SettingsParseError(path, err);
  }
}

export function writeSettings(path: string, settings: ClaudeSettings): void {
  atomicWrite(path, JSON.stringify(settings, null, 2) + '\n');
}

function hasMarker(cfg: HookConfig): boolean {
  return cfg.hooks?.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
}

export function addAtraceHooks(settings: ClaudeSettings, command: string): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const hooks = { ...(next.hooks ?? {}) };

  for (const event of HOOK_EVENTS) {
    const existing = (hooks[event] ?? []).filter((c) => !hasMarker(c));
    existing.push({
      matcher: '*',
      hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_MS }],
    });
    hooks[event] = existing;
  }

  next.hooks = hooks;
  return next;
}

export function removeAtraceHooks(settings: ClaudeSettings): {
  next: ClaudeSettings;
  removed: number;
} {
  if (!settings.hooks) return { next: settings, removed: 0 };

  const next: ClaudeSettings = { ...settings };
  const hooks: Record<string, HookConfig[]> = {};
  let removed = 0;

  for (const [event, configs] of Object.entries(settings.hooks)) {
    const before = configs.length;
    const kept = configs.filter((c) => !hasMarker(c));
    removed += before - kept.length;
    if (kept.length > 0) hooks[event] = kept;
  }

  if (Object.keys(hooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = hooks;
  }
  return { next, removed };
}

export function countAtraceHooks(settings: ClaudeSettings): number {
  if (!settings.hooks) return 0;
  let n = 0;
  for (const configs of Object.values(settings.hooks)) {
    for (const c of configs) {
      if (hasMarker(c)) n++;
    }
  }
  return n;
}

export function listAtraceCommands(settings: ClaudeSettings): string[] {
  if (!settings.hooks) return [];
  const out: string[] = [];
  for (const configs of Object.values(settings.hooks)) {
    for (const c of configs) {
      for (const h of c.hooks ?? []) {
        if (typeof h.command === 'string' && h.command.includes(HOOK_MARKER)) {
          out.push(h.command);
        }
      }
    }
  }
  return out;
}
