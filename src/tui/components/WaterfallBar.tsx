import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { colors, symbols } from '../theme.js';
import { formatDuration } from '../../util/time.js';

interface WaterfallBarProps {
  span: SpanEvent;
  timelineStart: number;
  timelineEnd: number;
  width: number;
  depth?: number;
}

export function WaterfallBar({ span, timelineStart, timelineEnd, width, depth = 0 }: WaterfallBarProps) {
  const totalDuration = timelineEnd - timelineStart;
  if (totalDuration <= 0) return null;

  const indent = depth > 0 ? '  '.repeat(depth) : '';
  const labelMaxLen = Math.max(14 - depth * 2, 6);
  const barWidth = Math.max(width - 20 - depth * 2, 20);
  const startOffset = Math.floor(((span.started_at - timelineStart) / totalDuration) * barWidth);
  const endPoint = span.ended_at ?? Date.now();
  const spanWidth = Math.max(1, Math.floor(((endPoint - span.started_at) / totalDuration) * barWidth));

  const label = `${indent}${span.name}`.padEnd(14).slice(0, 14);
  const duration = span.duration_ms ? formatDuration(span.duration_ms) : '...';

  const barColor = span.status === 'error'
    ? colors.error
    : span.kind === 'tool_use'
      ? colors.tool_use
      : span.kind === 'llm_call'
        ? colors.llm_call
        : colors.custom_step;

  const before = symbols.block_light.repeat(Math.max(0, startOffset));
  const bar = symbols.block_full.repeat(Math.min(spanWidth, barWidth - startOffset));
  const after = symbols.block_light.repeat(Math.max(0, barWidth - startOffset - spanWidth));

  return (
    <Box>
      <Text color={colors.text}>{label} </Text>
      <Text color={colors.muted}>{before}</Text>
      <Text color={barColor}>{bar}</Text>
      <Text color={colors.muted}>{after}</Text>
      <Text color={colors.muted}> {duration}</Text>
    </Box>
  );
}
