import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { TokenTable } from '../components/TokenTable.js';
import { useTokenStats } from '../hooks/useTokenStats.js';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';

interface TokenViewProps {
  events: SpanEvent[];
  sessionId: string | null;
}

export function TokenView({ events, sessionId }: TokenViewProps) {
  const stats = useTokenStats(events);

  if (stats.breakdown.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No LLM calls recorded yet...</Text>
      </Box>
    );
  }

  const duration = events.length > 0
    ? (events[events.length - 1].ended_at ?? Date.now()) - events[0].started_at
    : 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={colors.primary} bold>Token Usage</Text>
        <Text color={colors.muted}> | Session: </Text>
        <Text color={colors.text}>{sessionId?.slice(0, 8)}</Text>
        <Text color={colors.muted}> | Duration: </Text>
        <Text color={colors.text}>{formatDuration(duration)}</Text>
        <Text color={colors.muted}> | Total: </Text>
        <Text color={colors.warning} bold>{formatCost(stats.totalCost)}</Text>
      </Box>
      <TokenTable
        breakdown={stats.breakdown}
        totalInputTokens={stats.totalInputTokens}
        totalOutputTokens={stats.totalOutputTokens}
        totalCost={stats.totalCost}
      />
    </Box>
  );
}
