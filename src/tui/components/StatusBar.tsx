import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';

interface StatusBarProps {
  sessionId: string | null;
  eventCount: number;
  startedAt: number | null;
  totalCost: number;
  transcriptCost?: number | null;
  model?: string | null;
  turns?: number | null;
  contextTokens?: number | null;
  contextLimit?: number;
  cacheHitRate?: number | null;
}

interface Chip {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}

function ChipText({ chip }: { chip: Chip }) {
  return (
    <Box marginRight={2}>
      <Text color={colors.muted}>{chip.label}: </Text>
      <Text color={chip.color || colors.text} bold={chip.bold}>{chip.value}</Text>
    </Box>
  );
}

export function StatusBar({
  sessionId,
  eventCount,
  startedAt,
  totalCost,
  transcriptCost,
  model,
  turns,
  contextTokens,
  contextLimit = 200_000,
  cacheHitRate,
}: StatusBarProps) {
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const displayCost = transcriptCost ?? totalCost;
  const effectiveLimit =
    contextTokens != null && contextTokens > 200_000 ? 1_000_000 : contextLimit;
  const rawCtxPct =
    contextTokens != null && effectiveLimit > 0
      ? (contextTokens / effectiveLimit) * 100
      : null;
  const ctxPct = rawCtxPct == null ? null : Math.min(100, rawCtxPct);
  const ctxOver = rawCtxPct != null && rawCtxPct > 100;

  const chips: Chip[] = [
    { label: 'Session', value: sessionId?.slice(0, 8) ?? 'none', color: colors.primary },
  ];
  if (model) chips.push({ label: 'Model', value: model, color: colors.llm_call });
  chips.push({
    label: 'Events',
    value: turns ? `${eventCount} (${turns} LLM)` : `${eventCount}`,
  });
  if (ctxPct != null) {
    chips.push({
      label: 'Ctx',
      value: `${ctxPct.toFixed(0)}%${ctxOver ? '+' : ''}`,
      color: ctxPct >= 75 ? colors.error : ctxPct > 50 ? colors.warning : colors.secondary,
      bold: ctxPct >= 75,
    });
  }
  if (cacheHitRate != null) {
    chips.push({
      label: 'Cache',
      value: `${(cacheHitRate * 100).toFixed(0)}%`,
      color: cacheHitRate < 0.4 ? colors.warning : colors.secondary,
    });
  }
  chips.push({ label: 'Time', value: formatDuration(elapsed) });
  chips.push({
    label: 'Cost',
    value: formatCost(displayCost),
    color: displayCost > 1 ? colors.error : colors.warning,
    bold: displayCost > 0.5,
  });

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Box flexWrap="wrap">
        {chips.map((c) => (
          <ChipText key={c.label} chip={c} />
        ))}
        <Box marginRight={2}>
          <Text color={colors.muted}>?:help  Tab/←→:switch  jk↑↓:scroll  q:quit</Text>
        </Box>
      </Box>
    </Box>
  );
}
