import { describe, it, expect } from 'vitest';
import { aggregateFileHeatmap } from '../../../src/tui/hooks/useFileHeatmap.js';
import type { SpanEvent } from '../../../src/types/events.js';

function span(name: string, input: Record<string, unknown>, ts = 0): SpanEvent {
  return {
    id: 'id-' + Math.random(),
    parent_id: null,
    session_id: 's',
    kind: 'tool_use',
    status: 'ok',
    source: 'claude_code_hook',
    name,
    started_at: ts,
    ended_at: ts,
    duration_ms: 0,
    input,
    output: null,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0,
    error: null,
    metadata: null,
  };
}

describe('aggregateFileHeatmap', () => {
  it('counts tool activity per file', () => {
    const events = [
      span('Read', { file_path: '/a.ts' }),
      span('Read', { file_path: '/a.ts' }),
      span('Edit', { file_path: '/a.ts' }),
      span('Write', { file_path: '/b.ts' }),
    ];

    const rows = aggregateFileHeatmap(events);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.file_path === '/a.ts')!;
    expect(a.reads).toBe(2);
    expect(a.edits).toBe(1);
    expect(a.total).toBe(3);
  });

  it('flags redundant reads with no edits', () => {
    const events = [
      span('Read', { file_path: '/x.ts' }),
      span('Read', { file_path: '/x.ts' }),
      span('Read', { file_path: '/x.ts' }),
      span('Read', { file_path: '/x.ts' }),
    ];
    const rows = aggregateFileHeatmap(events);
    expect(rows[0].redundancy_score).toBeCloseTo(1, 1);
  });

  it('low redundancy when reads pair with edits', () => {
    const events = [
      span('Read', { file_path: '/y.ts' }),
      span('Edit', { file_path: '/y.ts' }),
      span('Edit', { file_path: '/y.ts' }),
    ];
    const rows = aggregateFileHeatmap(events);
    expect(rows[0].redundancy_score).toBe(0);
  });

  it('sorts by total', () => {
    const events = [
      span('Read', { file_path: '/low.ts' }),
      span('Read', { file_path: '/high.ts' }),
      span('Read', { file_path: '/high.ts' }),
      span('Read', { file_path: '/high.ts' }),
    ];
    const rows = aggregateFileHeatmap(events);
    expect(rows[0].file_path).toBe('/high.ts');
  });
});
