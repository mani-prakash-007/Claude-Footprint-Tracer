import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

interface HookEntry {
  type: string;
  command: string;
  timeout: number;
}

interface HookConfig {
  matcher: string;
  hooks: HookEntry[];
}

interface Settings {
  hooks?: Record<string, HookConfig[]>;
  [key: string]: unknown;
}

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
];

const HOOK_MARKER = 'agent-trace';

export function getHookCommand(): string {
  // Resolve the hook handler from the installed package
  const __filename = fileURLToPath(import.meta.url);
  const hookHandlerPath = join(dirname(__filename), 'hook-handler.js');
  return `node ${hookHandlerPath}`;
}

export function install(options: { scope: 'user' | 'project' } = { scope: 'user' }): void {
  const settingsPath = options.scope === 'user'
    ? join(homedir(), '.claude', 'settings.json')
    : join(process.cwd(), '.claude', 'settings.json');

  const settings = readSettings(settingsPath);
  const hookCommand = getHookCommand();

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Remove existing agent-trace hooks
    settings.hooks[event] = settings.hooks[event].filter(
      (h) => !h.hooks?.some((hook) => hook.command.includes(HOOK_MARKER))
    );

    // Add new hook
    settings.hooks[event].push({
      matcher: '*',
      hooks: [{
        type: 'command',
        command: hookCommand,
        timeout: 5000,
      }],
    });
  }

  writeSettings(settingsPath, settings);
  console.log(`Hooks installed to: ${settingsPath}`);
  console.log(`Events: ${HOOK_EVENTS.join(', ')}`);
}

export function uninstall(options: { scope: 'user' | 'project' } = { scope: 'user' }): void {
  const settingsPath = options.scope === 'user'
    ? join(homedir(), '.claude', 'settings.json')
    : join(process.cwd(), '.claude', 'settings.json');

  if (!existsSync(settingsPath)) {
    console.log('No settings file found. Nothing to uninstall.');
    return;
  }

  const settings = readSettings(settingsPath);

  if (!settings.hooks) {
    console.log('No hooks configured. Nothing to uninstall.');
    return;
  }

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) continue;
    settings.hooks[event] = settings.hooks[event].filter(
      (h) => !h.hooks?.some((hook) => hook.command.includes(HOOK_MARKER))
    );
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(settingsPath, settings);
  console.log(`Hooks removed from: ${settingsPath}`);
}

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
}
