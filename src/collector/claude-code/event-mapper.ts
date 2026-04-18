import type { SpanEvent } from '../../types/events.js';
import type { HookInput } from '../../types/hook-io.js';
import { generateId } from '../../util/id.js';

export type MapResult =
  | { type: 'create_session'; session: { session_id: string; source: 'claude_code_hook'; started_at: number; cwd?: string } }
  | { type: 'insert_span'; span: SpanEvent }
  | { type: 'update_span'; sessionId: string; toolName: string; updates: Partial<SpanEvent> }
  | { type: 'end_session'; session_id: string; ended_at: number }
  | { type: 'noop' };

export function mapHookToSpan(input: HookInput): MapResult {
  const now = Date.now();

  switch (input.hook_event_name) {
    case 'SessionStart':
      return {
        type: 'create_session',
        session: {
          session_id: input.session_id,
          source: 'claude_code_hook',
          started_at: now,
          cwd: input.cwd,
        },
      };

    case 'UserPromptSubmit':
      return {
        type: 'insert_span',
        span: {
          id: generateId(),
          parent_id: null,
          session_id: input.session_id,
          kind: 'user_message',
          status: 'ok',
          source: 'claude_code_hook',
          name: 'User Message',
          started_at: now,
          ended_at: now,
          duration_ms: 0,
          input: { message: input.user_prompt || (input as Record<string, unknown>).prompt || '' },
          output: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          cache_write_tokens: null,
          cost_usd: null,
          error: null,
          metadata: { raw_keys: Object.keys(input) },
        },
      };

    case 'PreToolUse':
      return {
        type: 'insert_span',
        span: {
          id: generateId(),
          parent_id: null,
          session_id: input.session_id,
          kind: input.tool_name === 'Agent' ? 'custom_step' : 'tool_use',
          status: 'pending',
          source: 'claude_code_hook',
          name: input.tool_name ?? 'unknown',
          started_at: now,
          ended_at: null,
          duration_ms: null,
          input: input.tool_input ?? null,
          output: null,
          model: null,
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          cache_write_tokens: null,
          cost_usd: null,
          error: null,
          metadata: { cwd: input.cwd, is_agent: input.tool_name === 'Agent' },
        },
      };

    case 'PostToolUse':
      return {
        type: 'update_span',
        sessionId: input.session_id,
        toolName: input.tool_name ?? 'unknown',
        updates: {
          status: 'ok',
          ended_at: now,
          output: { response: input.tool_response },
        },
      };

    case 'PostToolUseFailure':
      return {
        type: 'update_span',
        sessionId: input.session_id,
        toolName: input.tool_name ?? 'unknown',
        updates: {
          status: 'error',
          ended_at: now,
          error: String(input.tool_response ?? 'Unknown error'),
        },
      };

    case 'Stop':
    case 'SessionEnd':
      return {
        type: 'end_session',
        session_id: input.session_id,
        ended_at: now,
      };

    default:
      return { type: 'noop' };
  }
}
