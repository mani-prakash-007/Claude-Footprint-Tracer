import { useMemo } from 'react';
import type { SpanEvent } from '../../types/events.js';

export interface FileHeatRow {
  file_path: string;
  reads: number;
  edits: number;
  writes: number;
  greps: number;
  globs: number;
  total: number;
  redundancy_score: number;
  last_seen_at: number;
}

const READ_TOOLS = new Set(['Read']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit']);
const WRITE_TOOLS = new Set(['Write', 'NotebookEdit']);
const GREP_TOOLS = new Set(['Grep']);
const GLOB_TOOLS = new Set(['Glob']);

/**
 * Aggregate per-file tool activity. Reads:Edits ratio surfaces "looking
 * without acting" — the inefficiency pattern from issue #42796.
 * Redundancy = reads when no edits / total reads.
 */
export function aggregateFileHeatmap(events: SpanEvent[]): FileHeatRow[] {
  const rows = new Map<string, FileHeatRow>();

  for (const event of events) {
    if (event.kind !== 'tool_use') continue;
    const input = event.input as Record<string, unknown> | null;
    if (!input) continue;

    const path = pickPath(event.name, input);
    if (!path) continue;

    let row = rows.get(path);
    if (!row) {
      row = {
        file_path: path,
        reads: 0,
        edits: 0,
        writes: 0,
        greps: 0,
        globs: 0,
        total: 0,
        redundancy_score: 0,
        last_seen_at: event.started_at,
      };
      rows.set(path, row);
    }

    if (READ_TOOLS.has(event.name)) row.reads += 1;
    else if (EDIT_TOOLS.has(event.name)) row.edits += 1;
    else if (WRITE_TOOLS.has(event.name)) row.writes += 1;
    else if (GREP_TOOLS.has(event.name)) row.greps += 1;
    else if (GLOB_TOOLS.has(event.name)) row.globs += 1;

    row.total = row.reads + row.edits + row.writes + row.greps + row.globs;
    row.last_seen_at = Math.max(row.last_seen_at, event.started_at);
  }

  // Redundancy = fraction of reads that did NOT lead to a write/edit.
  // (Edit, MultiEdit, Write, NotebookEdit all count as "acted on file".)
  for (const row of rows.values()) {
    const acted = row.edits + row.writes;
    row.redundancy_score = row.reads > 0
      ? Math.max(0, (row.reads - acted) / row.reads)
      : 0;
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

export function useFileHeatmap(events: SpanEvent[]): FileHeatRow[] {
  return useMemo(() => aggregateFileHeatmap(events), [events]);
}

function pickPath(toolName: string, input: Record<string, unknown>): string | null {
  if (READ_TOOLS.has(toolName) || EDIT_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName)) {
    const p = input.file_path as string | undefined;
    return p ?? null;
  }
  if (GREP_TOOLS.has(toolName)) {
    const path = (input.path as string) ?? '<workspace>';
    const pattern = (input.pattern as string) ?? '';
    return `grep:${path}:${pattern.slice(0, 40)}`;
  }
  if (GLOB_TOOLS.has(toolName)) {
    const pattern = (input.pattern as string) ?? '';
    return `glob:${pattern}`;
  }
  return null;
}
