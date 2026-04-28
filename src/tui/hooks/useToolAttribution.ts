import { useMemo } from 'react';
import type { SpanEvent } from '../../types/events.js';

export interface ToolAttributionRow {
  tool_name: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ToolAttributionResult {
  rows: ToolAttributionRow[];
  total: number;
  attributed: number;
}

/**
 * Group tool_use spans by name and sum their attributed input/output tokens.
 * Skips spans that haven't been attributed yet (NULL columns).
 */
export function aggregateToolAttribution(events: SpanEvent[]): ToolAttributionResult {
  const byTool = new Map<string, ToolAttributionRow>();
  let attributed = 0;

  for (const ev of events) {
    if (ev.kind !== 'tool_use' && ev.kind !== 'custom_step') continue;
    const input = ev.input_token_attribution ?? null;
    const output = ev.output_token_attribution ?? null;
    if (input == null && output == null) continue;

    attributed += 1;
    let row = byTool.get(ev.name);
    if (!row) {
      row = {
        tool_name: ev.name,
        call_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      };
      byTool.set(ev.name, row);
    }
    row.call_count += 1;
    row.input_tokens += input ?? 0;
    row.output_tokens += output ?? 0;
    row.total_tokens = row.input_tokens + row.output_tokens;
  }

  const total = Array.from(byTool.values()).reduce((s, r) => s + r.total_tokens, 0);
  const rows = Array.from(byTool.values()).sort((a, b) => b.total_tokens - a.total_tokens);
  return { rows, total, attributed };
}

export function useToolAttribution(events: SpanEvent[]): ToolAttributionResult {
  return useMemo(() => aggregateToolAttribution(events), [events]);
}
