import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../src/storage/database.js';
import { EventWriter } from '../../src/storage/writer.js';
import { EventReader } from '../../src/storage/reader.js';
import type { SpanEvent } from '../../src/types/events.js';

describe('EventWriter', () => {
  let db: ReturnType<typeof createDatabase>;
  let writer: EventWriter;
  let reader: EventReader;

  beforeEach(() => {
    db = createDatabase(':memory:');
    writer = new EventWriter(db);
    reader = new EventReader(db);
  });

  it('creates a session', () => {
    writer.createSession({
      session_id: 'sess-1',
      source: 'claude_code_hook',
      started_at: 1000,
      cwd: '/tmp',
    });

    const sessions = reader.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe('sess-1');
  });

  it('inserts and reads spans', () => {
    writer.createSession({
      session_id: 'sess-1',
      source: 'sdk_wrapper',
      started_at: 1000,
    });

    const span: SpanEvent = {
      id: 'span-1',
      parent_id: null,
      session_id: 'sess-1',
      kind: 'tool_use',
      status: 'pending',
      source: 'sdk_wrapper',
      name: 'Grep',
      started_at: 1000,
      ended_at: null,
      duration_ms: null,
      input: { pattern: 'TODO' },
      output: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      cost_usd: null,
      error: null,
      metadata: null,
    };

    writer.insertSpan(span);
    const spans = reader.getSessionSpans('sess-1');
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('Grep');
    expect(spans[0].status).toBe('pending');
    expect(spans[0].input).toEqual({ pattern: 'TODO' });
  });

  it('updates a span', () => {
    writer.createSession({
      session_id: 'sess-1',
      source: 'sdk_wrapper',
      started_at: 1000,
    });

    const span: SpanEvent = {
      id: 'span-2',
      parent_id: null,
      session_id: 'sess-1',
      kind: 'tool_use',
      status: 'pending',
      source: 'sdk_wrapper',
      name: 'Read',
      started_at: 1000,
      ended_at: null,
      duration_ms: null,
      input: { file: 'test.ts' },
      output: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      cost_usd: null,
      error: null,
      metadata: null,
    };

    writer.insertSpan(span);
    writer.updateSpan('span-2', {
      status: 'ok',
      ended_at: 2000,
      duration_ms: 1000,
      output: { content: 'file content' },
    });

    const updated = reader.getSpan('span-2');
    expect(updated?.status).toBe('ok');
    expect(updated?.ended_at).toBe(2000);
    expect(updated?.duration_ms).toBe(1000);
    expect(updated?.output).toEqual({ content: 'file content' });
  });

  it('finds pending span for correlation', () => {
    writer.createSession({
      session_id: 'sess-1',
      source: 'claude_code_hook',
      started_at: 1000,
    });

    const span: SpanEvent = {
      id: 'span-3',
      parent_id: null,
      session_id: 'sess-1',
      kind: 'tool_use',
      status: 'pending',
      source: 'claude_code_hook',
      name: 'Bash',
      started_at: 1000,
      ended_at: null,
      duration_ms: null,
      input: { command: 'ls' },
      output: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      cost_usd: null,
      error: null,
      metadata: null,
    };

    writer.insertSpan(span);
    const foundId = writer.findPendingSpan('sess-1', 'Bash');
    expect(foundId).toBe('span-3');
  });

  it('polling returns only new spans', () => {
    writer.createSession({
      session_id: 'sess-1',
      source: 'sdk_wrapper',
      started_at: 1000,
    });

    writer.insertSpan({
      id: 'span-a',
      parent_id: null,
      session_id: 'sess-1',
      kind: 'tool_use',
      status: 'ok',
      source: 'sdk_wrapper',
      name: 'first',
      started_at: 1000,
      ended_at: 1100,
      duration_ms: 100,
      input: null,
      output: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      cost_usd: null,
      error: null,
      metadata: null,
    });

    const { spans: first, newLastRowId } = reader.getSpansSince('sess-1', 0);
    expect(first).toHaveLength(1);

    writer.insertSpan({
      id: 'span-b',
      parent_id: null,
      session_id: 'sess-1',
      kind: 'tool_use',
      status: 'ok',
      source: 'sdk_wrapper',
      name: 'second',
      started_at: 2000,
      ended_at: 2100,
      duration_ms: 100,
      input: null,
      output: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      cost_usd: null,
      error: null,
      metadata: null,
    });

    const { spans: second } = reader.getSpansSince('sess-1', newLastRowId);
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe('second');
  });
});
