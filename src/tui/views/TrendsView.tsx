import React from 'react';
import { Box, Text } from 'ink';
import { useSessionMetrics } from '../hooks/useSessionMetrics.js';
import type { SessionMetrics } from '../../types/events.js';
import { colors } from '../theme.js';
import { formatCost } from '../../util/cost.js';
import { formatDuration } from '../../util/time.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';

interface TrendsViewProps {
  selectedIndex: number;
  selectedForCompare: Set<string>;
  onSelect?: (sessionId: string) => void;
  insights?: SessionInsights;
}

const TICKS = ['_', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

/**
 * Trends + comparison view (replaces SessionListView).
 *
 * Shows the last N sessions with sparklines for cost / turns / cache-hit
 * across the window. Press `c` while two rows are checked to enter compare
 * mode (handled by App.tsx). A duplicate row in the table marks selected
 * sessions so users see what's about to be diffed.
 */
export function TrendsView({ selectedIndex, selectedForCompare, insights }: TrendsViewProps) {
  const sessions = useSessionMetrics(20, 5000);

  if (sessions.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No sessions recorded yet.</Text>
      </Box>
    );
  }

  const compareList = sessions.filter((s) => selectedForCompare.has(s.session_id));

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="trends" />}
      <Box>
        <Text color={colors.primary} bold>Trends</Text>
        <Text color={colors.muted}> | last </Text>
        <Text color={colors.text}>{sessions.length}</Text>
        <Text color={colors.muted}> sessions | press </Text>
        <Text color={colors.warning}>space</Text>
        <Text color={colors.muted}> to mark, </Text>
        <Text color={colors.warning}>c</Text>
        <Text color={colors.muted}> to compare 2</Text>
      </Box>

      <SparklineRow label="Cost" values={sessions.map((s) => s.total_cost_usd).reverse()} format={(v) => formatCost(v)} />
      <SparklineRow label="Turns" values={sessions.map((s) => s.llm_call_count).reverse()} format={(v) => `${v}`} />
      <SparklineRow
        label="Cache hit %"
        values={sessions.map((s) => s.cache_hit_rate * 100).reverse()}
        format={(v) => `${v.toFixed(0)}%`}
      />
      <SparklineRow
        label="Compactions"
        values={sessions.map((s) => s.compaction_count).reverse()}
        format={(v) => `${v}`}
      />

      <Text color={colors.border}>{'─'.repeat(78)}</Text>
      <HeaderRow />
      {sessions.map((s, i) => (
        <SessionMetricsRow
          key={s.session_id}
          metrics={s}
          isSelected={i === selectedIndex}
          isMarked={selectedForCompare.has(s.session_id)}
        />
      ))}

      {compareList.length === 2 && (
        <CompareBlock a={compareList[0]} b={compareList[1]} />
      )}
    </Box>
  );
}

function HeaderRow() {
  return (
    <Box>
      <Text color={colors.muted}>{'   Session'.padEnd(15)}</Text>
      <Text color={colors.muted}>{'Started'.padEnd(20)}</Text>
      <Text color={colors.muted}>{'Turns'.padStart(7)}</Text>
      <Text color={colors.muted}>{'Tokens'.padStart(11)}</Text>
      <Text color={colors.muted}>{'Cache'.padStart(7)}</Text>
      <Text color={colors.muted}>{'Cost'.padStart(10)}</Text>
    </Box>
  );
}

function SessionMetricsRow({
  metrics,
  isSelected,
  isMarked,
}: {
  metrics: SessionMetrics;
  isSelected: boolean;
  isMarked: boolean;
}) {
  const date = new Date(metrics.started_at).toLocaleString();
  const cursor = isSelected ? '> ' : '  ';
  const mark = isMarked ? '\u25C9 ' : '  ';
  const tokens = metrics.total_input_tokens + metrics.total_output_tokens;
  const cachePct = `${(metrics.cache_hit_rate * 100).toFixed(0)}%`;
  return (
    <Box>
      <Text color={isSelected ? colors.primary : colors.text} bold={isSelected}>
        {cursor + mark + metrics.session_id.slice(0, 8)}
      </Text>
      <Text color={colors.muted}> {date.padEnd(19)}</Text>
      <Text color={colors.text}>{String(metrics.llm_call_count).padStart(7)}</Text>
      <Text color={colors.text}>{tokens.toLocaleString().padStart(11)}</Text>
      <Text color={metrics.cache_hit_rate < 0.4 ? colors.warning : colors.secondary}>
        {cachePct.padStart(7)}
      </Text>
      <Text color={metrics.total_cost_usd > 1 ? colors.error : colors.warning}>
        {formatCost(metrics.total_cost_usd).padStart(10)}
      </Text>
    </Box>
  );
}

function SparklineRow({
  label,
  values,
  format,
}: {
  label: string;
  values: number[];
  format: (v: number) => string;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const ticks = values.map((v) => TICKS[Math.floor((v / max) * (TICKS.length - 1))]).join('');
  const last = values[values.length - 1];
  return (
    <Box>
      <Text color={colors.muted}>{label.padEnd(14)}</Text>
      <Text color={colors.llm_call}>{ticks}</Text>
      <Text color={colors.muted}>  current: </Text>
      <Text color={colors.text}>{format(last)}</Text>
    </Box>
  );
}

function CompareBlock({ a, b }: { a: SessionMetrics; b: SessionMetrics }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.primary} bold>Compare</Text>
      <Text color={colors.border}>{'─'.repeat(78)}</Text>
      <DiffRow label="Cost" a={a.total_cost_usd} b={b.total_cost_usd} format={formatCost} />
      <DiffRow label="LLM calls" a={a.llm_call_count} b={b.llm_call_count} format={(v) => `${v}`} />
      <DiffRow
        label="Input tokens"
        a={a.total_input_tokens}
        b={b.total_input_tokens}
        format={(v) => v.toLocaleString()}
      />
      <DiffRow
        label="Output tokens"
        a={a.total_output_tokens}
        b={b.total_output_tokens}
        format={(v) => v.toLocaleString()}
      />
      <DiffRow
        label="Cache hit %"
        a={a.cache_hit_rate * 100}
        b={b.cache_hit_rate * 100}
        format={(v) => `${v.toFixed(0)}%`}
      />
      <DiffRow
        label="Thinking toks"
        a={a.thinking_tokens}
        b={b.thinking_tokens}
        format={(v) => v.toLocaleString()}
      />
      <DiffRow
        label="Compactions"
        a={a.compaction_count}
        b={b.compaction_count}
        format={(v) => `${v}`}
      />
      <DiffRow
        label="Duration"
        a={(a.ended_at ?? Date.now()) - a.started_at}
        b={(b.ended_at ?? Date.now()) - b.started_at}
        format={formatDuration}
      />
    </Box>
  );
}

function DiffRow({
  label,
  a,
  b,
  format,
}: {
  label: string;
  a: number;
  b: number;
  format: (v: number) => string;
}) {
  const diff = b - a;
  const pct = a !== 0 ? (diff / a) * 100 : 0;
  const arrow = diff > 0 ? '\u25B2' : diff < 0 ? '\u25BC' : '=';
  const color = diff > 0 ? colors.error : diff < 0 ? colors.secondary : colors.muted;
  return (
    <Box>
      <Text color={colors.muted}>{label.padEnd(14)}</Text>
      <Text color={colors.text}>{format(a).padStart(12)}</Text>
      <Text color={colors.muted}>  →  </Text>
      <Text color={colors.text}>{format(b).padStart(12)}</Text>
      <Text color={colors.muted}>  </Text>
      <Text color={color}>
        {arrow} {format(Math.abs(diff))} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
      </Text>
    </Box>
  );
}
