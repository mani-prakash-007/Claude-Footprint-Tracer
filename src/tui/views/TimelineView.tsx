import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { WaterfallBar } from '../components/WaterfallBar.js';
import { colors } from '../theme.js';

interface TimelineViewProps {
  events: SpanEvent[];
  width: number;
}

export function TimelineView({ events, width }: TimelineViewProps) {
  const spans = events.filter((e) => e.kind !== 'session' && e.kind !== 'user_message');

  if (spans.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No tool/LLM spans to display yet...</Text>
      </Box>
    );
  }

  const timelineStart = spans[0].started_at;
  const timelineEnd = Math.max(...spans.map((s) => s.ended_at ?? Date.now()));

  // Compute depth for indentation
  const depthMap = new Map<string, number>();
  for (const span of spans) {
    if (span.parent_id) {
      depthMap.set(span.id, (depthMap.get(span.parent_id) ?? 0) + 1);
    } else {
      depthMap.set(span.id, 0);
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={colors.primary} bold>Timeline (waterfall)</Text>
      <Text color={colors.border}>{'─'.repeat(Math.min(width - 4, 80))}</Text>
      {spans.map((span) => (
        <WaterfallBar
          key={span.id}
          span={span}
          timelineStart={timelineStart}
          timelineEnd={timelineEnd}
          width={Math.min(width - 4, 80)}
          depth={depthMap.get(span.id) ?? 0}
        />
      ))}
    </Box>
  );
}
