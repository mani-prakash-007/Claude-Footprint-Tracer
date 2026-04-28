import React from 'react';
import { Text } from 'ink';
import { GAUGE_SEGMENTS } from '../theme.js';

interface GaugeProps {
  value: number;
  max: number;
  width?: number;
  color?: string;
}

/**
 * Segmented progress bar (htop-style). Renders `width` cells of
 * `█` / `▓` / `▒` / `░` / ` ` proportional to value/max.
 */
export function Gauge({ value, max, width = 10, color }: GaugeProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const filled = ratio * width;
  const fullCells = Math.floor(filled);
  const remainder = filled - fullCells;

  let partial: string = GAUGE_SEGMENTS.empty;
  if (remainder >= 0.85) partial = GAUGE_SEGMENTS.full;
  else if (remainder >= 0.6) partial = GAUGE_SEGMENTS.three;
  else if (remainder >= 0.35) partial = GAUGE_SEGMENTS.half;
  else if (remainder >= 0.15) partial = GAUGE_SEGMENTS.light;

  const used = fullCells + (partial !== GAUGE_SEGMENTS.empty ? 1 : 0);
  const empty = Math.max(0, width - used);
  const bar = GAUGE_SEGMENTS.full.repeat(fullCells)
    + (partial !== GAUGE_SEGMENTS.empty ? partial : '')
    + GAUGE_SEGMENTS.light.repeat(empty);

  return <Text color={color}>{bar}</Text>;
}
