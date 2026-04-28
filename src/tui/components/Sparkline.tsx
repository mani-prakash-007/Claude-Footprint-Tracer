import React from 'react';
import { Text } from 'ink';
import { SPARKLINE_TICKS } from '../theme.js';

interface SparklineProps {
  values: number[];
  width?: number;
  color?: string;
  /** Override max — useful when scaling against an absolute ceiling (e.g. CONTEXT_LIMIT). */
  ceiling?: number;
}

/**
 * Single-pass O(width + values.length) sparkline. No per-bucket slice
 * allocations. Buckets values into width cells, rendering each as one of
 * 9 ramp glyphs.
 */
export function Sparkline({ values, width = 40, color, ceiling }: SparklineProps) {
  if (values.length === 0 || width <= 0) {
    return <Text color={color}>{' '.repeat(Math.max(0, width))}</Text>;
  }

  const sums = new Array(width).fill(0);
  const counts = new Array(width).fill(0);
  let max = 1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
    const b = Math.min(width - 1, Math.floor((i / values.length) * width));
    sums[b] += values[i];
    counts[b] += 1;
  }
  const denom = ceiling ? Math.max(max, ceiling) : max;
  const last = SPARKLINE_TICKS.length - 1;
  let out = '';
  for (let i = 0; i < width; i++) {
    if (counts[i] === 0) {
      out += SPARKLINE_TICKS[0];
    } else {
      const avg = sums[i] / counts[i];
      const ratio = Math.min(1, avg / denom);
      out += SPARKLINE_TICKS[Math.floor(ratio * last)];
    }
  }
  return <Text color={color}>{out}</Text>;
}
