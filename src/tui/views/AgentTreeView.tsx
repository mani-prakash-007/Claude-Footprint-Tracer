import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent, AgentNode } from '../../types/events.js';
import { useAgentTree, flattenTree } from '../hooks/useAgentTree.js';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';
import { Pill, type PillKind } from '../components/Pill.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';

interface AgentTreeViewProps {
  events: SpanEvent[];
  selectedIndex: number;
  visibleCount: number;
  insights?: SessionInsights;
}

/**
 * Sub-agent tree with rolled-up cost/tokens/duration per branch.
 *
 * Highlights:
 *   - Each Agent node shows total descendant cost so users can see which
 *     delegate ran away with their budget.
 *   - Indentation tracks parent_id depth.
 */
export function AgentTreeView({ events, selectedIndex, visibleCount, insights }: AgentTreeViewProps) {
  const tree = useAgentTree(events);
  const flat = flattenTree(tree);

  if (flat.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No agent spans yet.</Text>
      </Box>
    );
  }

  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleCount / 2), flat.length - visibleCount)
  );
  const visible = flat.slice(startIndex, startIndex + visibleCount);

  // Pull rollup totals from session insights when available so this header
  // never disagrees with the InsightsBanner above it.
  const totalCost = insights?.total_cost_usd ?? tree.reduce((s, r) => s + r.rolled_up.cost_usd, 0);
  const tokenSource = insights ? insights.total_cost_usd : 0;
  void tokenSource;
  const totalTokens = tree.reduce(
    (s, r) => s + r.rolled_up.input_tokens + r.rolled_up.output_tokens,
    0
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="agents" />}
      <Text color={colors.primary} bold>
        Agent Tree
        <Text color={colors.muted}>{`  roots ${tree.length}  spans ${flat.length}  tokens ${totalTokens.toLocaleString()}  cost `}</Text>
        <Text color={colors.warning}>{formatCost(totalCost)}</Text>
      </Text>
      <Text color={colors.border}>{'─'.repeat(78)}</Text>
      {visible.map((node, i) => (
        <AgentRow
          key={node.span.id}
          node={node}
          isSelected={startIndex + i === selectedIndex}
        />
      ))}
    </Box>
  );
}

function AgentRow({ node, isSelected }: { node: AgentNode; isSelected: boolean }) {
  const indent = '  '.repeat(node.depth);
  const branch = node.depth > 0 ? '└ ' : '';
  const label = nodeLabel(node);
  const hasChildren = node.children.length > 0;
  const color = colorForNode(node);
  const cost = formatCost(node.rolled_up.cost_usd);
  const tokens = node.rolled_up.input_tokens + node.rolled_up.output_tokens;
  const dur = node.rolled_up.duration_ms
    ? formatDuration(node.rolled_up.duration_ms)
    : node.span.status === 'pending'
      ? '...'
      : '0ms';
  const errors = node.rolled_up.error_count;

  const gutter = isSelected ? '▌' : ' ';
  const gutterColor = isSelected ? colors.primary : colors.muted;

  return (
    <Box>
      <Text color={gutterColor} bold={isSelected}>{gutter}</Text>
      <Text color={colors.muted}>{indent}{branch}</Text>
      <Pill kind={pillKindFor(node)} />
      <Text> </Text>
      <Text color={color} bold={isSelected} inverse={isSelected}>{label}</Text>
      <Text color={colors.muted}>  </Text>
      <Text color={colors.text}>{tokens.toLocaleString()} tok</Text>
      <Text color={colors.muted}> | </Text>
      <Text color={colors.warning}>{cost}</Text>
      <Text color={colors.muted}> | </Text>
      <Text color={colors.text}>{dur}</Text>
      {hasChildren && (
        <>
          <Text color={colors.muted}> | </Text>
          <Text color={colors.secondary}>{node.rolled_up.span_count - 1} children</Text>
        </>
      )}
      {errors > 0 && (
        <>
          <Text color={colors.muted}> | </Text>
          <Text color={colors.error}>{errors} err</Text>
        </>
      )}
    </Box>
  );
}

function pillKindFor(node: AgentNode): PillKind {
  if (node.span.status === 'error' || node.rolled_up.error_count > 0) return 'err';
  if (node.span.status === 'pending') return 'pending';
  return 'ok';
}

function nodeLabel(node: AgentNode): string {
  const span = node.span;
  if (span.name === 'Agent' || span.name === 'Task') {
    const desc = (span.input as Record<string, unknown> | null)?.description as string | undefined;
    const subtype = (span.input as Record<string, unknown> | null)?.subagent_type as string | undefined;
    return `Agent: ${desc || subtype || ''}`.trim();
  }
  if (span.kind === 'llm_call') return `LLM ${span.model || ''}`.trim();
  if (span.kind === 'tool_use') return `Tool: ${span.name}`;
  return span.name;
}

function colorForNode(node: AgentNode): string {
  if (node.span.status === 'error') return colors.error;
  if (node.span.kind === 'llm_call') return colors.llm_call;
  if (node.span.kind === 'tool_use') return colors.tool_use;
  if (node.span.kind === 'custom_step') return colors.custom_step;
  return colors.text;
}

