import { describe, it, expect } from 'vitest';
import { buildAgentTree, flattenTree } from '../../../src/tui/hooks/useAgentTree.js';
import type { SpanEvent } from '../../../src/types/events.js';

function span(overrides: Partial<SpanEvent>): SpanEvent {
  return {
    id: 'id-' + Math.random(),
    parent_id: null,
    session_id: 's',
    kind: 'tool_use',
    status: 'ok',
    source: 'claude_code_hook',
    name: 'Read',
    started_at: 0,
    ended_at: 0,
    duration_ms: 10,
    input: null,
    output: null,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0,
    error: null,
    metadata: null,
    ...overrides,
  };
}

describe('buildAgentTree', () => {
  it('rolls up cost and tokens recursively', () => {
    const root = span({ id: 'root', name: 'Agent', cost_usd: 0.01, input_tokens: 100, output_tokens: 50 });
    const child1 = span({ id: 'c1', parent_id: 'root', cost_usd: 0.05, input_tokens: 200, output_tokens: 80, duration_ms: 30 });
    const child2 = span({ id: 'c2', parent_id: 'root', cost_usd: 0.03, input_tokens: 50, output_tokens: 25, duration_ms: 20 });
    const grandchild = span({ id: 'g1', parent_id: 'c1', cost_usd: 0.02, input_tokens: 30, output_tokens: 10, duration_ms: 15 });

    const tree = buildAgentTree([root, child1, child2, grandchild]);

    expect(tree).toHaveLength(1);
    expect(tree[0].rolled_up.cost_usd).toBeCloseTo(0.11, 5);
    expect(tree[0].rolled_up.input_tokens).toBe(380);
    expect(tree[0].rolled_up.output_tokens).toBe(165);
    expect(tree[0].rolled_up.duration_ms).toBe(75);
    expect(tree[0].rolled_up.span_count).toBe(4);
  });

  it('counts errors per branch', () => {
    const root = span({ id: 'root', name: 'Agent' });
    const child = span({ id: 'c', parent_id: 'root', status: 'error' });
    const tree = buildAgentTree([root, child]);
    expect(tree[0].rolled_up.error_count).toBe(1);
  });

  it('flatten returns DFS order', () => {
    const root = span({ id: 'root', name: 'Agent' });
    const child1 = span({ id: 'c1', parent_id: 'root' });
    const child2 = span({ id: 'c2', parent_id: 'root' });
    const tree = buildAgentTree([root, child1, child2]);
    const flat = flattenTree(tree);
    expect(flat.map((n) => n.span.id)).toEqual(['root', 'c1', 'c2']);
  });

  it('handles orphans as roots', () => {
    const root = span({ id: 'a' });
    const orphan = span({ id: 'b', parent_id: 'missing' });
    const tree = buildAgentTree([root, orphan]);
    expect(tree).toHaveLength(2);
  });
});
