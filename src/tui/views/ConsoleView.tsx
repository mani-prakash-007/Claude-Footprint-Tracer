import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { EventRow } from '../components/EventRow.js';
import { colors } from '../theme.js';

interface ConsoleViewProps {
  events: SpanEvent[];
  selectedIndex: number;
  visibleCount: number;
}

export function ConsoleView({ events, selectedIndex, visibleCount }: ConsoleViewProps) {
  if (events.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={colors.muted}>Waiting for events...</Text>
        <Text color={colors.muted}>Run Claude Code in another terminal to see tool calls here.</Text>
      </Box>
    );
  }

  // Build depth map from parent_id (sub-agent nesting)
  const depthMap = new Map<string, number>();
  for (const event of events) {
    if (event.parent_id) {
      depthMap.set(event.id, (depthMap.get(event.parent_id) ?? 0) + 1);
    } else {
      depthMap.set(event.id, 0);
    }
  }

  const baseTime = events[0].started_at;
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(visibleCount / 2), events.length - visibleCount));
  const visible = events.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((event, i) => (
        <EventRow
          key={event.id}
          event={event}
          baseTime={baseTime}
          isSelected={startIndex + i === selectedIndex}
          depth={depthMap.get(event.id) ?? 0}
        />
      ))}
    </Box>
  );
}
