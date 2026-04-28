import { useMemo } from 'react';
import type { SpanEvent, AgentNode } from '../../types/events.js';

/**
 * Build a tree of Agent (sub-agent) spans plus their direct work,
 * with cost / tokens / duration rolled up recursively.
 */
export function buildAgentTree(events: SpanEvent[]): AgentNode[] {
  if (events.length === 0) return [];

  const byId = new Map<string, AgentNode>();
  const roots: AgentNode[] = [];

  for (const span of events) {
    byId.set(span.id, makeNode(span, 0));
  }

  for (const span of events) {
    const node = byId.get(span.id)!;
    if (span.parent_id && byId.has(span.parent_id)) {
      const parent = byId.get(span.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const root of roots) rollUp(root);
  return roots;
}

export function useAgentTree(events: SpanEvent[]): AgentNode[] {
  return useMemo(() => buildAgentTree(events), [events]);
}

function makeNode(span: SpanEvent, depth: number): AgentNode {
  // Tool spans don't carry billed input/output_tokens (those are LLM-call
  // columns). Fall back to per-tool attribution columns so the rollup
  // surfaces tokens spent inside tool calls.
  const inputTokens = span.input_tokens ?? span.input_token_attribution ?? 0;
  const outputTokens = span.output_tokens ?? span.output_token_attribution ?? 0;
  return {
    span,
    depth,
    children: [],
    rolled_up: {
      cost_usd: span.cost_usd ?? 0,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: span.cache_read_tokens ?? 0,
      cache_write_tokens: span.cache_write_tokens ?? 0,
      duration_ms: span.duration_ms ?? 0,
      span_count: 1,
      error_count: span.status === 'error' ? 1 : 0,
    },
  };
}

function rollUp(node: AgentNode): void {
  for (const child of node.children) {
    rollUp(child);
    node.rolled_up.cost_usd += child.rolled_up.cost_usd;
    node.rolled_up.input_tokens += child.rolled_up.input_tokens;
    node.rolled_up.output_tokens += child.rolled_up.output_tokens;
    node.rolled_up.cache_read_tokens += child.rolled_up.cache_read_tokens;
    node.rolled_up.cache_write_tokens += child.rolled_up.cache_write_tokens;
    node.rolled_up.duration_ms += child.rolled_up.duration_ms;
    node.rolled_up.span_count += child.rolled_up.span_count;
    node.rolled_up.error_count += child.rolled_up.error_count;
  }
}

export function flattenTree(roots: AgentNode[]): AgentNode[] {
  const out: AgentNode[] = [];
  const walk = (node: AgentNode) => {
    out.push(node);
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return out;
}
