import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { colors, symbols } from '../theme.js';
import { formatRelativeTime } from '../../util/time.js';
import { summarizeInput } from '../../util/json.js';
import { formatDuration } from '../../util/time.js';
import { Pill, type PillKind } from './Pill.js';

function pillKindFor(event: SpanEvent): PillKind {
  if (event.status === 'error') return 'err';
  if (event.status === 'pending') return 'pending';
  if (event.kind === 'llm_call') return 'info';
  return 'ok';
}

interface EventRowProps {
  event: SpanEvent;
  baseTime: number;
  isSelected: boolean;
  depth?: number;
}

export function EventRow({ event, baseTime, isSelected, depth = 0 }: EventRowProps) {
  const timestamp = formatRelativeTime(event.started_at, baseTime);
  const { icon, label, detail, color } = formatEvent(event);
  const indent = depth > 0 ? '  '.repeat(depth) + '└ ' : '';

  // Selected: bright cyan ▌ gutter + bold + inverse on label so the whole
  // row reads as the focus, not just the bolded text.
  const gutter = isSelected ? '▌' : ' ';
  const gutterColor = isSelected ? colors.primary : colors.muted;

  return (
    <Box>
      <Text color={gutterColor} bold={isSelected}>{gutter}</Text>
      <Text color={colors.muted}>[{timestamp}]</Text>
      <Text> </Text>
      <Pill kind={pillKindFor(event)} />
      <Text> </Text>
      <Text color={colors.muted}>{indent}</Text>
      <Text color={color}>{icon}</Text>
      <Text> </Text>
      <Text color={color} bold={isSelected} inverse={isSelected}>{label}</Text>
      <Text> </Text>
      <Text color={colors.text} dimColor={!isSelected} bold={isSelected}>{detail}</Text>
      {event.kind === 'tool_use' && (event.input_token_attribution || event.output_token_attribution) ? (
        <>
          <Text color={colors.muted}> · </Text>
          <Text color={colors.warning}>
            ~{formatTokens((event.input_token_attribution ?? 0) + (event.output_token_attribution ?? 0))} tok
          </Text>
        </>
      ) : null}
    </Box>
  );
}

function formatTokens(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

function formatEvent(event: SpanEvent): { icon: string; label: string; detail: string; color: string } {
  switch (event.kind) {
    case 'user_message':
      return {
        icon: symbols.arrow_right,
        label: 'User',
        detail: summarizeInput(event.input, 80),
        color: colors.user_message,
      };

    case 'tool_use': {
      const isComplete = event.status !== 'pending';
      const durationStr = event.duration_ms ? ` (${formatDuration(event.duration_ms)})` : '';
      const statusIcon = event.status === 'ok' ? symbols.check : event.status === 'error' ? symbols.cross : '...';

      if (isComplete) {
        return {
          icon: symbols.arrow_left,
          label: `Tool: ${event.name}`,
          detail: `${statusIcon}${durationStr}`,
          color: event.status === 'error' ? colors.error : colors.tool_use,
        };
      }
      return {
        icon: symbols.arrow_right,
        label: `Tool: ${event.name}`,
        detail: summarizeInput(event.input, 60),
        color: colors.tool_use,
      };
    }

    case 'llm_call': {
      const tokens = event.output_tokens ? `${event.output_tokens} tok` : '';
      const cost = event.cost_usd ? ` $${event.cost_usd.toFixed(4)}` : '';
      return {
        icon: symbols.arrow_left,
        label: 'LLM',
        detail: `${event.model ?? ''}${tokens ? ` (${tokens}${cost})` : ''}`,
        color: colors.llm_call,
      };
    }

    case 'custom_step': {
      const agentDesc = event.name === 'Agent' && event.input
        ? (event.input as Record<string, unknown>).description as string || (event.input as Record<string, unknown>).subagent_type as string || ''
        : '';
      const durationStr = event.duration_ms ? formatDuration(event.duration_ms) : event.status === 'pending' ? '...' : '';
      const statusIcon = event.status === 'ok' ? symbols.check : event.status === 'error' ? symbols.cross : '';
      return {
        icon: event.status === 'pending' ? symbols.arrow_right : symbols.dot,
        label: event.name === 'Agent' ? `Agent: ${agentDesc}`.trim() : event.name,
        detail: `${statusIcon} ${durationStr}`.trim(),
        color: colors.custom_step,
      };
    }

    default:
      return {
        icon: symbols.dot,
        label: event.name,
        detail: '',
        color: colors.muted,
      };
  }
}
