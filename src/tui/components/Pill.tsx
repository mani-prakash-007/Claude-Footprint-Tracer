import React from 'react';
import { Text } from 'ink';
import { colors, symbols } from '../theme.js';

export type PillKind = 'ok' | 'warn' | 'err' | 'info' | 'pending' | 'running';

const COLOR: Record<PillKind, string> = {
  ok: colors.ok,
  warn: colors.warning,
  err: colors.error,
  info: colors.primary,
  pending: colors.pending,
  running: colors.pending,
};

const GLYPH: Record<PillKind, string> = {
  ok: symbols.pill_dot,
  warn: symbols.pill_dot,
  err: symbols.pill_dot,
  info: symbols.pill_dot,
  pending: symbols.pending_ring,
  running: symbols.running,
};

interface PillProps {
  kind: PillKind;
  label?: string;
  bold?: boolean;
}

/**
 * Status pill. Single source of truth for status glyph + color.
 * Used in Console rows, Agent tree, status bar, every row that needs
 * "did this thing succeed?" feedback.
 */
export function Pill({ kind, label, bold = false }: PillProps) {
  const color = COLOR[kind];
  const glyph = GLYPH[kind];
  return (
    <Text color={color} bold={bold}>
      {glyph}
      {label ? ` ${label}` : ''}
    </Text>
  );
}
