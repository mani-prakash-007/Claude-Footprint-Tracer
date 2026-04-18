import React from 'react';
import { Box, Text } from 'ink';
import type { SessionSummary } from '../../types/events.js';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';

interface SessionListViewProps {
  sessions: SessionSummary[];
  selectedIndex: number;
  onSelect: (sessionId: string) => void;
}

export function SessionListView({ sessions, selectedIndex }: SessionListViewProps) {
  if (sessions.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No sessions recorded yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={colors.primary} bold>Sessions</Text>
      <Text color={colors.border}>{'─'.repeat(70)}</Text>
      {sessions.map((session, i) => {
        const isSelected = i === selectedIndex;
        const duration = session.ended_at
          ? formatDuration(session.ended_at - session.started_at)
          : 'active';
        const date = new Date(session.started_at).toLocaleString();

        return (
          <Box key={session.session_id}>
            <Text color={isSelected ? colors.primary : colors.text} bold={isSelected}>
              {isSelected ? '> ' : '  '}
              {session.session_id.slice(0, 8)}
            </Text>
            <Text color={colors.muted}> | </Text>
            <Text color={colors.text}>{date}</Text>
            <Text color={colors.muted}> | </Text>
            <Text color={colors.text}>{session.span_count} events</Text>
            <Text color={colors.muted}> | </Text>
            <Text color={colors.text}>{duration}</Text>
            <Text color={colors.muted}> | </Text>
            <Text color={colors.warning}>{formatCost(session.total_cost_usd)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
