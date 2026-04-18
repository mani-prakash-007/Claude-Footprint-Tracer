import { describe, it, expect } from 'vitest';
import { mapHookToSpan } from '../../src/collector/claude-code/event-mapper.js';
import type { HookInput } from '../../src/types/hook-io.js';

describe('mapHookToSpan', () => {
  it('maps SessionStart to create_session', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'SessionStart',
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('create_session');
    if (result.type === 'create_session') {
      expect(result.session.session_id).toBe('sess-1');
      expect(result.session.source).toBe('claude_code_hook');
      expect(result.session.cwd).toBe('/project');
    }
  });

  it('maps UserPromptSubmit to user_message span', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'UserPromptSubmit',
      user_prompt: 'find all TODOs',
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('insert_span');
    if (result.type === 'insert_span') {
      expect(result.span.kind).toBe('user_message');
      expect(result.span.status).toBe('ok');
      expect(result.span.input).toEqual({ message: 'find all TODOs' });
    }
  });

  it('maps PreToolUse to pending tool_use span', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: 'TODO' },
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('insert_span');
    if (result.type === 'insert_span') {
      expect(result.span.kind).toBe('tool_use');
      expect(result.span.status).toBe('pending');
      expect(result.span.name).toBe('Grep');
      expect(result.span.input).toEqual({ pattern: 'TODO' });
    }
  });

  it('maps PostToolUse to update_span', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'PostToolUse',
      tool_name: 'Grep',
      tool_response: '15 matches found',
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('update_span');
    if (result.type === 'update_span') {
      expect(result.toolName).toBe('Grep');
      expect(result.updates.status).toBe('ok');
      expect(result.updates.output).toEqual({ response: '15 matches found' });
    }
  });

  it('maps Stop to end_session', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'Stop',
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('end_session');
    if (result.type === 'end_session') {
      expect(result.session_id).toBe('sess-1');
    }
  });

  it('returns noop for unknown events', () => {
    const input: HookInput = {
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'SomeUnknownEvent',
    };

    const result = mapHookToSpan(input);
    expect(result.type).toBe('noop');
  });
});
