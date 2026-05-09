export interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

export interface HookConfig {
  matcher: string;
  hooks: HookEntry[];
}

export interface ClaudeSettings {
  hooks?: Record<string, HookConfig[]>;
  [key: string]: unknown;
}

export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export const HOOK_MARKER = 'agent-trace';
export const HOOK_TIMEOUT_MS = 5000;
