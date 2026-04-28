import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { EventRow } from '../components/EventRow.js';
import { SpanDetail } from '../components/SpanDetail.js';
import { useLoopDetection } from '../hooks/useLoopDetection.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';
import { colors } from '../theme.js';

interface ConsoleViewProps {
  events: SpanEvent[];
  selectedIndex: number;
  visibleCount: number;
  insights?: SessionInsights;
  width?: number;
}

export function ConsoleView({
  events,
  selectedIndex,
  visibleCount,
  insights,
  width = 120,
}: ConsoleViewProps) {
  // Hooks first — Rules of Hooks.
  const loopWarnings = useLoopDetection(events);
  const depthMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const event of events) {
      if (event.parent_id) m.set(event.id, (m.get(event.parent_id) ?? 0) + 1);
      else m.set(event.id, 0);
    }
    return m;
  }, [events]);

  if (events.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={colors.muted}>Waiting for events...</Text>
        <Text color={colors.muted}>Run Claude Code in another terminal to see tool calls here.</Text>
      </Box>
    );
  }

  const baseTime = events[0].started_at;
  const showDetailPane = width >= 100;
  const detailWidth = showDetailPane ? Math.max(40, Math.floor(width * 0.42)) : 0;
  const listWidth = width - detailWidth - 2;

  const bannerLines = (insights ? 2 : 0) + (loopWarnings.length > 0 ? Math.min(3, loopWarnings.length) + 1 : 0);
  const listVisible = Math.max(3, visibleCount - bannerLines);
  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(listVisible / 2), events.length - listVisible)
  );
  const visible = events.slice(startIndex, startIndex + listVisible);
  const selected = events[selectedIndex];

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="console" />}
      {loopWarnings.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          {loopWarnings.slice(0, 3).map((w) => (
            <Text
              key={`${w.tool}:${w.key}`}
              color={w.severity === 'critical' ? colors.error : colors.warning}
              bold={w.severity === 'critical'}
            >
              {w.severity === 'critical' ? '\u{1F6A8}' : '\u26A0'} {w.tool}: {w.key.slice(0, 45)} — {w.reason}
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="row">
        <Box flexDirection="column" width={showDetailPane ? listWidth : undefined} flexShrink={0}>
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

        {showDetailPane && (
          <Box flexDirection="column" width={detailWidth} flexShrink={0} marginLeft={1}>
            {selected ? (
              <SpanDetail event={selected} height={listVisible + 2} width={detailWidth} embedded />
            ) : (
              <Text color={colors.muted}>No span selected</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
