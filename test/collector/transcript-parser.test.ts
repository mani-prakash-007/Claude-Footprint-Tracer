import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  parseTranscript,
  getTranscriptCost,
  getContextTimeline,
  getCompactionEvents,
} from '../../src/collector/claude-code/transcript-parser.js';

const TEST_DIR = join(import.meta.dirname, '../../tmp-test-transcript');

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeTranscript(filename: string, lines: object[]): string {
  const path = join(TEST_DIR, filename);
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n'));
  return path;
}

describe('transcript-parser', () => {
  it('parses assistant turns with token usage', () => {
    const path = writeTranscript('basic.jsonl', [
      { type: 'permission-mode', permissionMode: 'default', sessionId: 'test' },
      {
        type: 'assistant',
        uuid: 'turn-1',
        timestamp: 1000,
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_read_input_tokens: 2000,
            cache_creation_input_tokens: 300,
          },
          content: [{ type: 'text', text: 'hello' }],
          stop_reason: 'end_turn',
        },
      },
      {
        type: 'assistant',
        uuid: 'turn-2',
        timestamp: 2000,
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 800,
            output_tokens: 200,
            cache_read_input_tokens: 3000,
            cache_creation_input_tokens: 0,
          },
          content: [{ type: 'text', text: 'world' }, { type: 'tool_use', name: 'Bash' }],
          stop_reason: 'tool_use',
        },
      },
    ]);

    const { turns, summary } = parseTranscript(path);

    expect(turns).toHaveLength(2);
    expect(turns[0].model).toBe('claude-opus-4-6');
    expect(turns[0].input_tokens).toBe(500);
    expect(turns[0].output_tokens).toBe(100);
    expect(turns[0].cache_read_tokens).toBe(2000);
    expect(turns[0].cache_write_tokens).toBe(300);
    expect(turns[0].content_types).toEqual(['text']);
    expect(turns[0].stop_reason).toBe('end_turn');

    expect(turns[1].content_types).toEqual(['text', 'tool_use']);
    expect(turns[1].stop_reason).toBe('tool_use');

    expect(summary.turns).toBe(2);
    expect(summary.total_input_tokens).toBe(1300);
    expect(summary.total_output_tokens).toBe(300);
    expect(summary.total_cache_read_tokens).toBe(5000);
    expect(summary.total_cache_write_tokens).toBe(300);
    expect(summary.model).toBe('claude-opus-4-6');
    expect(summary.total_cost_usd).toBeGreaterThan(0);
  });

  it('handles user messages', () => {
    const path = writeTranscript('with-user.jsonl', [
      { type: 'user', uuid: 'u1', timestamp: 500, message: { role: 'user', content: 'hi' } },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: 1000,
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{ type: 'text' }],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const { turns, summary } = parseTranscript(path);
    expect(turns).toHaveLength(2);
    expect(turns[0].type).toBe('user');
    expect(turns[1].type).toBe('assistant');
    expect(summary.user_messages).toBe(1);
  });

  it('returns empty for non-existent file', () => {
    const { turns, summary } = parseTranscript('/nonexistent/path.jsonl');
    expect(turns).toHaveLength(0);
    expect(summary.turns).toBe(0);
    expect(summary.total_cost_usd).toBe(0);
  });

  it('calculates cost correctly for claude-opus-4-6', () => {
    const path = writeTranscript('cost.jsonl', [
      {
        type: 'assistant',
        uuid: 'c1',
        timestamp: 1000,
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          usage: {
            input_tokens: 1_000_000,  // 1M tokens
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          content: [],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const summary = getTranscriptCost(path);
    // 1M input tokens at $15/M = $15
    expect(summary.total_cost_usd).toBeCloseTo(15.0, 1);
  });

  it('counts thinking tokens and redaction', () => {
    const path = writeTranscript('thinking.jsonl', [
      {
        type: 'assistant',
        uuid: 't1',
        timestamp: 1000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            { type: 'thinking', thinking: 'I need to consider this carefully'.repeat(8) },
            { type: 'text', text: 'ok' },
          ],
          stop_reason: 'end_turn',
        },
      },
      {
        type: 'assistant',
        uuid: 't2',
        timestamp: 2000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            { type: 'redacted_thinking', data: 'redacted-blob' },
            { type: 'text', text: 'ok' },
          ],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const { turns, summary } = parseTranscript(path);
    expect(turns[0].thinking_tokens).toBeGreaterThan(0);
    expect(turns[0].thinking_redacted).toBe(false);
    expect(turns[1].thinking_redacted).toBe(true);
    expect(summary.thinking_redacted_turns).toBe(1);
    expect(summary.total_thinking_tokens).toBeGreaterThan(0);
  });

  it('detects compaction boundaries', () => {
    const path = writeTranscript('compaction.jsonl', [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: 1000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 50000, output_tokens: 1000, cache_read_input_tokens: 100000 },
          content: [{ type: 'text' }],
          stop_reason: 'end_turn',
        },
      },
      { type: 'system', subtype: 'compact_boundary', timestamp: 1500, afterTokens: 5000 },
      {
        type: 'assistant',
        uuid: 'a2',
        timestamp: 2000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 5000, output_tokens: 200 },
          content: [{ type: 'text' }],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const compactions = getCompactionEvents(path);
    expect(compactions).toHaveLength(1);
    expect(compactions[0].after_tokens).toBe(5000);

    const summary = getTranscriptCost(path);
    expect(summary.compaction_count).toBe(1);
  });

  it('builds context timeline with compaction markers', () => {
    const path = writeTranscript('timeline.jsonl', [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: 1000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 1000, output_tokens: 100 },
          content: [{ type: 'text' }],
          stop_reason: 'end_turn',
        },
      },
      { type: 'system', subtype: 'compact_boundary', timestamp: 1500, afterTokens: 800 },
      {
        type: 'assistant',
        uuid: 'a2',
        timestamp: 2000,
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 800, output_tokens: 50 },
          content: [{ type: 'text' }],
          stop_reason: 'end_turn',
        },
      },
    ]);

    const timeline = getContextTimeline(path);
    expect(timeline.length).toBe(3);
    expect(timeline.some((p) => p.compacted)).toBe(true);
    const turnsOnly = timeline.filter((p) => !p.compacted);
    // context_tokens = input + cache_read (output is the next turn's input,
    // so adding it would double-count across turns).
    expect(turnsOnly[0].context_tokens).toBe(1000);
    expect(turnsOnly[1].context_tokens).toBe(800);
  });

  it('skips malformed lines gracefully', () => {
    const path = join(TEST_DIR, 'malformed.jsonl');
    writeFileSync(path, [
      'not json at all',
      '{"type": "assistant"}',  // no message
      JSON.stringify({
        type: 'assistant',
        uuid: 'good',
        timestamp: 1000,
        message: { model: 'claude-opus-4-6', usage: { input_tokens: 100, output_tokens: 50 }, content: [], stop_reason: 'end_turn' },
      }),
    ].join('\n'));

    const { turns } = parseTranscript(path);
    expect(turns).toHaveLength(1);
    expect(turns[0].input_tokens).toBe(100);
  });
});
