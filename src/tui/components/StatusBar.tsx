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
}

export function StatusBar({ sessionId, eventCount, startedAt, totalCost }: StatusBarProps) {
  const elapsed = startedAt ? Date.now() - startedAt : 0;

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1} justifyContent="space-between">
      <Text color={colors.muted}>
        Session: <Text color={colors.primary}>{sessionId?.slice(0, 8) ?? 'none'}</Text>
      </Text>
      <Text color={colors.muted}>
        Events: <Text color={colors.text}>{eventCount}</Text>
      </Text>
      <Text color={colors.muted}>
        Time: <Text color={colors.text}>{formatDuration(elapsed)}</Text>
      </Text>
      <Text color={colors.muted}>
        Cost: <Text color={colors.warning}>{formatCost(totalCost)}</Text>
      </Text>
      <Text color={colors.muted}>
        q:quit Tab:switch j/k:scroll
      </Text>
    </Box>
  );
}
