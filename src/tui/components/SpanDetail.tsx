import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';

interface SpanDetailProps {
  event: SpanEvent;
  height: number;
  width?: number;
  /** When true, drop the "Span Detail (Esc to close)" header — used in split panes. */
  embedded?: boolean;
}

export function SpanDetail({ event, height, width, embedded = false }: SpanDetailProps) {
  const lines: Array<{ label: string; value: string; color?: string }> = [
    { label: 'ID', value: event.id },
    { label: 'Kind', value: event.kind, color: (colors as Record<string, string>)[event.kind] },
    { label: 'Name', value: event.name },
    { label: 'Status', value: event.status, color: event.status === 'error' ? colors.error : colors.ok },
    { label: 'Duration', value: event.duration_ms ? formatDuration(event.duration_ms) : 'N/A' },
  ];

  if (event.model) lines.push({ label: 'Model', value: event.model, color: colors.llm_call });
  if (event.input_tokens) lines.push({ label: 'Input Tokens', value: event.input_tokens.toLocaleString() });
  if (event.output_tokens) lines.push({ label: 'Output Tokens', value: event.output_tokens.toLocaleString() });
  if (event.cache_read_tokens) lines.push({ label: 'Cache Read', value: event.cache_read_tokens.toLocaleString() });
  if (event.cost_usd) lines.push({ label: 'Cost', value: formatCost(event.cost_usd), color: colors.warning });

  // Per-tool attribution (Phase 6). Falls back to zero when not yet attributed.
  if (event.input_token_attribution != null || event.output_token_attribution != null) {
    const inAttr = event.input_token_attribution ?? 0;
    const outAttr = event.output_token_attribution ?? 0;
    lines.push({ label: 'Attr Input', value: `~${inAttr.toLocaleString()} tok`, color: colors.warning });
    lines.push({ label: 'Attr Output', value: `~${outAttr.toLocaleString()} tok`, color: colors.warning });
    if (event.attribution_method) {
      lines.push({ label: 'Method', value: event.attribution_method, color: colors.muted });
    }
  }

  if (event.tool_use_id) lines.push({ label: 'Tool Use ID', value: event.tool_use_id, color: colors.muted });
  if (event.error) lines.push({ label: 'Error', value: event.error, color: colors.error });
  if (event.parent_id) lines.push({ label: 'Parent', value: event.parent_id });

  const inputJson = event.input ? JSON.stringify(event.input, null, 2) : null;
  const outputJson = event.output ? JSON.stringify(event.output, null, 2) : null;

  const headerLines = lines.length + (embedded ? 2 : 4);
  const jsonSpace = Math.max(height - headerLines - 4, 4);
  const halfJson = Math.floor(jsonSpace / 2);
  const sep = '─'.repeat(width ? Math.max(10, width - 4) : 70);

  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {!embedded && (
        <>
          <Text color={colors.primary} bold>Span Detail (Esc to close)</Text>
          <Text color={colors.border}>{sep}</Text>
        </>
      )}
      {embedded && (
        <>
          <Text color={colors.primary} bold>Detail</Text>
          <Text color={colors.border}>{sep}</Text>
        </>
      )}

      {lines.map(({ label, value, color }) => (
        <Box key={label}>
          <Text color={colors.muted}>{label.padEnd(13)}</Text>
          <Text color={color || colors.text} wrap="truncate-end">{value}</Text>
        </Box>
      ))}

      {inputJson && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.primary} bold>Input</Text>
          <Text color={colors.text} wrap="truncate-end">
            {inputJson.split('\n').slice(0, halfJson).join('\n')}
          </Text>
        </Box>
      )}

      {outputJson && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.primary} bold>Output</Text>
          <Text color={colors.text} wrap="truncate-end">
            {outputJson.split('\n').slice(0, halfJson).join('\n')}
          </Text>
        </Box>
      )}

      {event.error && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.error} bold>Error</Text>
          <Text color={colors.error} wrap="truncate-end">{event.error}</Text>
        </Box>
      )}
    </Box>
  );
}
