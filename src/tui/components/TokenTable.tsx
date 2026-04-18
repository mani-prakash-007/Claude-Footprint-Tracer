import React from 'react';
import { Box, Text } from 'ink';
import type { TokenBreakdown } from '../../types/events.js';
import { colors } from '../theme.js';
import { formatCost } from '../../util/cost.js';

interface TokenTableProps {
  breakdown: TokenBreakdown[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export function TokenTable({ breakdown, totalInputTokens, totalOutputTokens, totalCost }: TokenTableProps) {
  const nameWidth = 20;
  const numWidth = 10;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text color={colors.primary} bold>{'Step'.padEnd(nameWidth)}</Text>
        <Text color={colors.primary} bold>{'In Tok'.padStart(numWidth)}</Text>
        <Text color={colors.primary} bold>{'Out Tok'.padStart(numWidth)}</Text>
        <Text color={colors.primary} bold>{'Cost'.padStart(numWidth)}</Text>
        <Text color={colors.primary} bold>{'Model'.padStart(numWidth + 5)}</Text>
      </Box>
      <Text color={colors.border}>{'─'.repeat(nameWidth + numWidth * 3 + numWidth + 5)}</Text>

      {/* Rows */}
      {breakdown.map((row, i) => (
        <Box key={row.span_id}>
          <Text color={colors.text}>{row.name.padEnd(nameWidth).slice(0, nameWidth)}</Text>
          <Text color={colors.text}>{String(row.input_tokens).padStart(numWidth)}</Text>
          <Text color={colors.text}>{String(row.output_tokens).padStart(numWidth)}</Text>
          <Text color={colors.warning}>{formatCost(row.cost_usd).padStart(numWidth)}</Text>
          <Text color={colors.muted}>{row.model.padStart(numWidth + 5).slice(0, numWidth + 5)}</Text>
        </Box>
      ))}

      {/* Footer total */}
      <Text color={colors.border}>{'─'.repeat(nameWidth + numWidth * 3 + numWidth + 5)}</Text>
      <Box>
        <Text color={colors.text} bold>{'TOTAL'.padEnd(nameWidth)}</Text>
        <Text color={colors.text} bold>{String(totalInputTokens).padStart(numWidth)}</Text>
        <Text color={colors.text} bold>{String(totalOutputTokens).padStart(numWidth)}</Text>
        <Text color={colors.warning} bold>{formatCost(totalCost).padStart(numWidth)}</Text>
      </Box>
    </Box>
  );
}
