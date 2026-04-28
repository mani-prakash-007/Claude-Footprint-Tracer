import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { useFileHeatmap, type FileHeatRow } from '../hooks/useFileHeatmap.js';
import { colors } from '../theme.js';
import { Gauge } from '../components/Gauge.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';

interface FileHeatmapViewProps {
  events: SpanEvent[];
  selectedIndex: number;
  visibleCount: number;
  insights?: SessionInsights;
}

/**
 * File-access heatmap. Sorts files by total tool activity and surfaces a
 * redundancy score (high reads with no edits = wasted budget). Pattern from
 * issue #42796: read:edit ratio collapse correlates with quality regression.
 */
export function FileHeatmapView({ events, selectedIndex, visibleCount, insights }: FileHeatmapViewProps) {
  const rows = useFileHeatmap(events);

  if (rows.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No file accesses yet…</Text>
      </Box>
    );
  }

  const startIndex = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleCount / 2), rows.length - visibleCount)
  );
  const visible = rows.slice(startIndex, startIndex + visibleCount);
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="files" />}
      <Text color={colors.primary} bold>File Heatmap <Text color={colors.muted}>(R:E ratio + redundancy from session insights)</Text></Text>
      <Text color={colors.border}>{'─'.repeat(78)}</Text>
      <HeaderRow />
      {visible.map((row, i) => (
        <FileRow
          key={row.file_path}
          row={row}
          isSelected={startIndex + i === selectedIndex}
          maxTotal={maxTotal}
        />
      ))}
    </Box>
  );
}

function HeaderRow() {
  return (
    <Box>
      <Text color={colors.muted}>{'  Path'.padEnd(40)}</Text>
      <Text color={colors.muted}>{' R '.padStart(4)}</Text>
      <Text color={colors.muted}>{' E '.padStart(4)}</Text>
      <Text color={colors.muted}>{' W '.padStart(4)}</Text>
      <Text color={colors.muted}>{' G '.padStart(4)}</Text>
      <Text color={colors.muted}>{'Tot'.padStart(5)}</Text>
      <Text color={colors.muted}>{'  Heat'.padEnd(14)}</Text>
      <Text color={colors.muted}>{'Redund'.padStart(8)}</Text>
    </Box>
  );
}

function FileRow({ row, isSelected, maxTotal }: { row: FileHeatRow; isSelected: boolean; maxTotal: number }) {
  const path = shortenPath(row.file_path, 38);
  const redCol =
    row.redundancy_score >= 0.6 ? colors.error : row.redundancy_score >= 0.3 ? colors.warning : colors.secondary;
  const heatCol = row.total >= maxTotal * 0.66 ? colors.error
    : row.total >= maxTotal * 0.33 ? colors.warning
    : colors.secondary;
  const gutter = isSelected ? '▌' : ' ';
  const gutterColor = isSelected ? colors.primary : colors.muted;
  return (
    <Box>
      <Text color={gutterColor} bold={isSelected}>{gutter}</Text>
      <Text color={isSelected ? colors.primary : colors.text} bold={isSelected} inverse={isSelected}>
        {' ' + path.padEnd(38)}
      </Text>
      <Text color={colors.text}>{String(row.reads).padStart(4)}</Text>
      <Text color={colors.text}>{String(row.edits).padStart(4)}</Text>
      <Text color={colors.text}>{String(row.writes).padStart(4)}</Text>
      <Text color={colors.text}>{String(row.greps + row.globs).padStart(4)}</Text>
      <Text color={colors.text}>{String(row.total).padStart(5)}</Text>
      <Text>  </Text>
      <Gauge value={row.total} max={maxTotal} width={10} color={heatCol} />
      <Text color={redCol}>{(row.redundancy_score * 100).toFixed(0).padStart(6)}%</Text>
    </Box>
  );
}

function shortenPath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(path.length - maxLen + 1);
}
