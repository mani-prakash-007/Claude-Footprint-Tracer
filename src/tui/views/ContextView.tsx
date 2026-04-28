import React from 'react';
import { Box, Text } from 'ink';
import { useContextTimeline } from '../hooks/useContextTimeline.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';
import { colors, symbols } from '../theme.js';

interface ContextViewProps {
  sessionId: string | null;
  width: number;
  insights?: SessionInsights;
}

const STANDARD_CONTEXT_LIMIT = 200_000;
const EXTENDED_CONTEXT_LIMIT = 1_000_000;

/**
 * Context window timeline.
 *
 * Top: numeric panel showing current context %, peak, last compaction.
 * Bottom: ASCII sparkline of context size per turn with red ▼ markers
 * at compaction boundaries.
 *
 * `current` / `peak` come from session insights so this view never disagrees
 * with the StatusBar or InsightsBanner above.
 */
export function ContextView({ sessionId, width, insights }: ContextViewProps) {
  const state = useContextTimeline(sessionId);

  if (!sessionId || state.points.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No transcript context data yet…</Text>
      </Box>
    );
  }

  const current = insights?.context_current ?? state.current_tokens;
  const peak = insights?.context_peak ?? state.peak_tokens;
  const limit =
    insights?.context_limit ??
    (peak > STANDARD_CONTEXT_LIMIT ? EXTENDED_CONTEXT_LIMIT : STANDARD_CONTEXT_LIMIT);
  const currentPct = Math.min(100, (current / limit) * 100);
  const peakPct = Math.min(100, (peak / limit) * 100);
  const lastCompaction = state.compactions[state.compactions.length - 1];

  const chartWidth = Math.max(40, Math.min(width - 8, 100));
  const sparkline = renderSparkline(state.points, chartWidth, limit);
  const compactionRow = renderCompactionRow(state.points, chartWidth);

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="context" />}
      <Text color={colors.primary} bold>Context Window</Text>
      <Text color={colors.border}>{'─'.repeat(chartWidth)}</Text>

      <Box>
        <Text color={colors.muted}>{'Current:'.padEnd(20)}</Text>
        <Text color={currentPct > 80 ? colors.error : currentPct > 50 ? colors.warning : colors.secondary} bold>
          {current.toLocaleString()} tok ({currentPct.toFixed(1)}%)
        </Text>
      </Box>
      <Box>
        <Text color={colors.muted}>{'Peak:'.padEnd(20)}</Text>
        <Text color={colors.text}>{peak.toLocaleString()} tok ({peakPct.toFixed(1)}%)</Text>
      </Box>
      <Box>
        <Text color={colors.muted}>{'Compactions:'.padEnd(20)}</Text>
        <Text color={state.compactions.length > 0 ? colors.warning : colors.text}>
          {state.compactions.length}
        </Text>
        {lastCompaction && (
          <Text color={colors.muted}>
            {' '}(last: {new Date(lastCompaction.occurred_at).toLocaleTimeString()})
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={colors.muted}>{'Timeline:'.padEnd(20)}</Text>
        <Text color={colors.muted}>(0% ─────► 100%)</Text>
      </Box>
      <Box>
        <Text color={colors.muted}>{' '.repeat(20)}</Text>
        <Text color={colors.llm_call}>{sparkline}</Text>
      </Box>
      {state.compactions.length > 0 && (
        <Box>
          <Text color={colors.muted}>{' '.repeat(20)}</Text>
          <Text color={colors.error}>{compactionRow}</Text>
        </Box>
      )}

      <Text color={colors.border}>{'─'.repeat(chartWidth)}</Text>
      <Text color={colors.muted}>
        Sparkline ticks: {symbols.block_light} low &nbsp; {symbols.block_medium} mid &nbsp; {symbols.block_full} high
      </Text>
    </Box>
  );
}

const TICKS = ['_', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

function renderSparkline(
  points: ReturnType<typeof useContextTimeline>['points'],
  width: number,
  contextLimit: number
): string {
  if (points.length === 0) return '';
  const buckets: number[] = new Array(width).fill(0);
  const max = Math.max(...points.map((p) => p.context_tokens), 1);
  const denom = Math.max(max, contextLimit * 0.05);

  for (let i = 0; i < width; i++) {
    const startIdx = Math.floor((i * points.length) / width);
    const endIdx = Math.max(startIdx + 1, Math.floor(((i + 1) * points.length) / width));
    const slice = points.slice(startIdx, endIdx);
    const avg = slice.length > 0 ? slice.reduce((s, p) => s + p.context_tokens, 0) / slice.length : 0;
    const ratio = Math.min(1, avg / denom);
    buckets[i] = Math.floor(ratio * (TICKS.length - 1));
  }

  return buckets.map((b) => TICKS[b]).join('');
}

function renderCompactionRow(
  points: ReturnType<typeof useContextTimeline>['points'],
  width: number
): string {
  if (points.length === 0) return '';
  const row: string[] = new Array(width).fill(' ');
  for (let i = 0; i < points.length; i++) {
    if (!points[i].compacted) continue;
    const col = Math.min(width - 1, Math.floor((i / points.length) * width));
    row[col] = '\u25BC';
  }
  return row.join('');
}
