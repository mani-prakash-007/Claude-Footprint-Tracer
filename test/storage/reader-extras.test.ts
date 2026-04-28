import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/migrations/index.js';
import { EventWriter } from '../../src/storage/writer.js';
import { EventReader } from '../../src/storage/reader.js';
import type { SpanEvent, CompactionEvent } from '../../src/types/events.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function span(overrides: Partial<SpanEvent>): SpanEvent {
  return {
    id: 'span-' + Math.random().toString(36).slice(2),
    parent_id: null,
    session_id: 'sess-1',
    kind: 'tool_use',
    status: 'ok',
    source: 'claude_code_hook',
    name: 'Read',
    started_at: Date.now(),
    ended_at: Date.now() + 50,
    duration_ms: 50,
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
    thinking_tokens: 0,
    thinking_redacted: 0,
    context_tokens: null,
    ...overrides,
  };
}

describe('reader extras', () => {
  it('rolls up session metrics including cache hit rate', () => {
    const db = makeDb();
    const writer = new EventWriter(db);
    const reader = new EventReader(db);

    writer.createSession({ session_id: 'sess-1', source: 'claude_code_hook', started_at: 1 });
    writer.insertSpan(
      span({
        kind: 'llm_call',
        name: 'llm:opus',
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_tokens: 4000,
        cache_write_tokens: 100,
        cost_usd: 0.05,
        thinking_tokens: 50,
        thinking_redacted: 0,
      })
    );
    writer.insertSpan(
      span({
        kind: 'llm_call',
        name: 'llm:opus',
        input_tokens: 500,
        output_tokens: 100,
        cache_read_tokens: 1000,
        cost_usd: 0.02,
        thinking_tokens: 0,
        thinking_redacted: 1,
      })
    );

    const metrics = reader.getSessionMetrics('sess-1');
    expect(metrics).not.toBeNull();
    expect(metrics!.llm_call_count).toBe(2);
    expect(metrics!.total_cost_usd).toBeCloseTo(0.07, 3);
    expect(metrics!.cache_hit_rate).toBeCloseTo(5000 / (5000 + 1500), 3);
    expect(metrics!.redaction_rate).toBeCloseTo(0.5, 3);

    db.close();
  });

  it('upserts file access counts', () => {
    const db = makeDb();
    const writer = new EventWriter(db);
    const reader = new EventReader(db);

    writer.createSession({ session_id: 'sess-1', source: 'claude_code_hook', started_at: 1 });
    writer.upsertFileAccess('sess-1', '/tmp/foo.ts', 'Read', 100);
    writer.upsertFileAccess('sess-1', '/tmp/foo.ts', 'Read', 200);
    writer.upsertFileAccess('sess-1', '/tmp/foo.ts', 'Edit', 200);

    const heat = reader.getFileHeatmap('sess-1');
    expect(heat).toHaveLength(2);
    const reads = heat.find((r) => r.tool_name === 'Read')!;
    expect(reads.access_count).toBe(2);
    expect(reads.last_seen_at).toBe(200);

    db.close();
  });

  it('persists compaction events', () => {
    const db = makeDb();
    const writer = new EventWriter(db);
    const reader = new EventReader(db);

    writer.createSession({ session_id: 'sess-1', source: 'claude_code_hook', started_at: 1 });
    const event: CompactionEvent = {
      id: 'c1',
      session_id: 'sess-1',
      occurred_at: 1500,
      before_tokens: 50000,
      after_tokens: 5000,
      trigger: 'auto',
      metadata: { uuid: 'u1' },
    };
    writer.insertCompactionEvent(event);

    const events = reader.getCompactionEvents('sess-1');
    expect(events).toHaveLength(1);
    expect(events[0].after_tokens).toBe(5000);
    expect(events[0].metadata).toEqual({ uuid: 'u1' });

    db.close();
  });
});
