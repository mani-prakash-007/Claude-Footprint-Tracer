import { describe, it, expect } from 'vitest';
import { aggregateToolAttribution } from '../../../src/tui/hooks/useToolAttribution.js';
import type { SpanEvent } from '../../../src/types/events.js';

function span(p: Partial<SpanEvent>): SpanEvent {
  return {
    id: 'sp-' + Math.random(),
    parent_id: null,
    session_id: 's',
    kind: 'tool_use',
    status: 'ok',
    source: 'claude_code_hook',
    name: 'Read',
    started_at: 0,
    ended_at: 0,
    duration_ms: 0,
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
    ...p,
  };
}

describe('aggregateToolAttribution', () => {
  it('skips spans without attribution', () => {
    const events = [span({ name: 'Read' }), span({ name: 'Edit' })];
    const r = aggregateToolAttribution(events);
    expect(r.attributed).toBe(0);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('groups by tool name and sums tokens', () => {
    const events = [
      span({ name: 'Read', input_token_attribution: 100, output_token_attribution: 200 }),
      span({ name: 'Read', input_token_attribution: 50, output_token_attribution: 150 }),
      span({ name: 'Bash', input_token_attribution: 30, output_token_attribution: 70 }),
    ];
    const r = aggregateToolAttribution(events);
    expect(r.attributed).toBe(3);
    expect(r.rows).toHaveLength(2);
    const read = r.rows.find((x) => x.tool_name === 'Read')!;
    expect(read.call_count).toBe(2);
    expect(read.input_tokens).toBe(150);
    expect(read.output_tokens).toBe(350);
    expect(read.total_tokens).toBe(500);
    expect(r.total).toBe(600);
  });

  it('sorts rows by total_tokens descending', () => {
    const events = [
      span({ name: 'Tiny', input_token_attribution: 1 }),
      span({ name: 'Big', input_token_attribution: 1000 }),
      span({ name: 'Mid', input_token_attribution: 100 }),
    ];
    const r = aggregateToolAttribution(events);
    expect(r.rows.map((x) => x.tool_name)).toEqual(['Big', 'Mid', 'Tiny']);
  });

  it('counts spans with only input attribution', () => {
    const events = [
      span({ name: 'Read', input_token_attribution: 50, output_token_attribution: null }),
    ];
    const r = aggregateToolAttribution(events);
    expect(r.attributed).toBe(1);
    expect(r.rows[0].input_tokens).toBe(50);
    expect(r.rows[0].output_tokens).toBe(0);
  });
});
