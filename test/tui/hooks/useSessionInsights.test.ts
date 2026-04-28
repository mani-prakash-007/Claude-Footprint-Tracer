import { describe, it, expect } from 'vitest';
import { computeSessionInsights } from '../../../src/tui/hooks/useSessionInsights.js';
import type { SpanEvent } from '../../../src/types/events.js';
import type {
  TranscriptTurn,
  TranscriptSummary,
} from '../../../src/collector/claude-code/transcript-parser.js';

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
    ended_at: 100,
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
    ...p,
  };
}

function turn(p: Partial<TranscriptTurn>): TranscriptTurn {
  return {
    type: 'assistant',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    thinking_tokens: 0,
    thinking_redacted: false,
    cost_usd: 0,
    timestamp: 0,
    content_types: [],
    stop_reason: null,
    uuid: '',
    context_tokens: 0,
    ...p,
  };
}

const summary: TranscriptSummary = {
  turns: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_cache_read_tokens: 0,
  total_cache_write_tokens: 0,
  total_thinking_tokens: 0,
  thinking_redacted_turns: 0,
  total_cost_usd: 0,
  model: null,
  user_messages: 0,
  compaction_count: 0,
};

describe('computeSessionInsights', () => {
  it('handles empty session safely', () => {
    const r = computeSessionInsights({ events: [], turns: [], summary: null });
    expect(r.total_cost_usd).toBe(0);
    expect(r.burn_rate_per_min).toBe(0);
    expect(r.cache_hit_rate).toBe(0);
    expect(r.context_pct).toBe(0);
  });

  it('computes burn rate + projected cost from duration', () => {
    const events = [
      span({ started_at: 0, ended_at: 600_000 }),       // 10 min
    ];
    const r = computeSessionInsights({
      events,
      turns: [],
      summary: { ...summary, total_cost_usd: 1.0 },
    });
    expect(r.burn_rate_per_min).toBeCloseTo(0.1, 2);
    expect(r.projected_60min_cost).toBeCloseTo(6, 1);
  });

  it('flags cache breakage when recent rate collapses', () => {
    const healthy = Array.from({ length: 12 }, () =>
      turn({ input_tokens: 100, cache_read_tokens: 900 })
    );
    const broken = Array.from({ length: 12 }, () =>
      turn({ input_tokens: 900, cache_read_tokens: 100 })
    );
    const turns = [...healthy, ...broken];
    const r = computeSessionInsights({
      events: [],
      turns,
      summary: {
        ...summary,
        total_input_tokens: turns.reduce((s, t) => s + t.input_tokens, 0),
        total_cache_read_tokens: turns.reduce((s, t) => s + t.cache_read_tokens, 0),
      },
    });
    expect(r.cache_breakage_alert).toBe(true);
    expect(r.recent_cache_hit_rate).toBeLessThan(r.cache_hit_rate);
  });

  it('counts errors and most-called tool', () => {
    const events = [
      span({ name: 'Bash', status: 'ok' }),
      span({ name: 'Bash', status: 'error' }),
      span({ name: 'Bash', status: 'error' }),
      span({ name: 'Read', status: 'ok' }),
    ];
    const r = computeSessionInsights({ events, turns: [], summary: null });
    expect(r.total_tool_calls).toBe(4);
    expect(r.error_tool_calls).toBe(2);
    expect(r.error_rate).toBe(0.5);
    expect(r.most_called_tool).toBe('Bash');
  });

  it('detects redundant files', () => {
    const events = [
      span({ name: 'Read', input: { file_path: '/a.ts' } }),
      span({ name: 'Read', input: { file_path: '/a.ts' } }),
      span({ name: 'Read', input: { file_path: '/a.ts' } }),
      span({ name: 'Read', input: { file_path: '/a.ts' } }),
      span({ name: 'Read', input: { file_path: '/b.ts' } }),
      span({ name: 'Edit', input: { file_path: '/b.ts' } }),
    ];
    const r = computeSessionInsights({ events, turns: [], summary: null });
    expect(r.redundant_files).toBe(1);
    expect(r.read_edit_ratio).toBeCloseTo(5, 1);
  });

  it('rolls up sub-agent delegated cost', () => {
    const events = [
      span({ id: 'root', name: 'rootTask', cost_usd: 0.0 }),
      span({ id: 'agent1', name: 'Agent', cost_usd: 0.1 }),
      span({ id: 'child1', parent_id: 'agent1', name: 'Read', cost_usd: 0.05 }),
      span({ id: 'child2', parent_id: 'agent1', name: 'Edit', cost_usd: 0.02 }),
      span({ id: 'standalone', name: 'Bash', cost_usd: 0.5 }),
    ];
    const r = computeSessionInsights({
      events,
      turns: [],
      summary: { ...summary, total_cost_usd: 0.67 },
    });
    expect(r.agent_count).toBe(1);
    expect(r.delegated_cost_usd).toBeCloseTo(0.17, 3);
    expect(r.delegated_share).toBeCloseTo(0.17 / 0.67, 2);
  });

  it('computes context pct from latest turn', () => {
    const turns = [
      turn({ context_tokens: 50_000 }),
      turn({ context_tokens: 100_000 }),
    ];
    const r = computeSessionInsights({ events: [], turns, summary: null });
    expect(r.context_current).toBe(100_000);
    expect(r.context_pct).toBe(50);
    expect(r.context_peak).toBe(100_000);
  });
});
