/**
 * Transcript JSONL Parser
 *
 * Parses Claude Code's transcript file to extract:
 * - Per-turn token usage (input, output, cache_read, cache_write)
 * - Model info
 * - User messages (full text)
 * - Session-level cost tracking
 * - Thinking blocks + redaction signal (P2 quality regression metrics)
 * - Context window timeline + auto-compaction boundaries (P1 context view)
 *
 * The transcript_path is provided in every hook stdin payload.
 */

import { readFileSync } from 'fs';
import { calculateCost } from '../../util/cost.js';
import type { SpanEvent, CompactionEvent } from '../../types/events.js';
import { generateId } from '../../util/id.js';

export interface TranscriptTurn {
  type: 'assistant' | 'user';
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  thinking_tokens: number;
  thinking_redacted: boolean;
  cost_usd: number;
  timestamp: number;
  content_types: string[];
  stop_reason: string | null;
  uuid: string;
  context_tokens: number;
}

export interface TranscriptSummary {
  turns: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_thinking_tokens: number;
  thinking_redacted_turns: number;
  total_cost_usd: number;
  model: string | null;
  user_messages: number;
  compaction_count: number;
}

export interface ContextTimelinePoint {
  turn_index: number;
  timestamp: number;
  context_tokens: number;
  compacted: boolean;
}

/**
 * Parse transcript JSONL file and extract token usage data.
 * Returns individual turns, compaction events, and aggregate summary.
 */
export function parseTranscript(transcriptPath: string, filterSessionId?: string | null): {
  turns: TranscriptTurn[];
  summary: TranscriptSummary;
  compactions: CompactionEvent[];
} {
  let content: string;
  try {
    content = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return { turns: [], summary: emptySummary(), compactions: [] };
  }

  const turns: TranscriptTurn[] = [];
  const compactions: CompactionEvent[] = [];
  let model: string | null = null;
  let runningContext = 0;
  let lastTurnContext = 0;
  let sessionId = '';

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeof obj.sessionId === 'string') sessionId = obj.sessionId;

    // Strict session filter: when caller supplies a sessionId, drop EVERY
    // assistant / user line that doesn't carry the matching sessionId.
    // System events without a sessionId pass through (compaction markers etc).
    if (filterSessionId && (obj.type === 'assistant' || obj.type === 'user')) {
      if (obj.sessionId !== filterSessionId) {
        continue;
      }
    }

    // Compaction boundary detection.
    // Claude Code marks summary entries with `isCompactSummary: true`,
    // and emits `subtype: "compact_boundary"` system events.
    const isCompaction =
      obj.isCompactSummary === true ||
      obj.subtype === 'compact_boundary' ||
      (obj.type === 'system' && (obj.eventType === 'compact' || obj.event === 'compact'));

    if (isCompaction) {
      const after = (obj.afterTokens as number) ?? (obj.after_tokens as number) ?? null;
      compactions.push({
        id: generateId(),
        session_id: sessionId,
        occurred_at: (obj.timestamp as number) || Date.now(),
        before_tokens: lastTurnContext || null,
        after_tokens: after,
        trigger: ((obj.trigger as string) ||
          (obj.compactReason as string) ||
          'auto') as CompactionEvent['trigger'],
        metadata: { uuid: (obj.uuid as string) || '' },
      });
      runningContext = after ?? 0;
      lastTurnContext = runningContext;
      continue;
    }

    if (obj.type === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined;
      if (!msg) continue;

      const usage = msg.usage as Record<string, number> | undefined;
      if (!usage) continue;

      const turnModel = (msg.model as string) || null;
      if (turnModel) model = turnModel;

      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheWrite = usage.cache_creation_input_tokens || 0;

      const cost = calculateCost(
        turnModel || 'claude-opus-4',
        inputTokens,
        outputTokens,
        cacheRead,
        cacheWrite
      );

      const contentArr = (msg.content as Array<Record<string, unknown>>) || [];
      const contentTypes = contentArr.map(c => (c.type as string) || 'unknown');

      // Thinking block analysis.
      // Anthropic SDK exposes thinking blocks (type === 'thinking') and a redacted
      // form (type === 'redacted_thinking'). Token counts aren't billed but the
      // text length proxies thinking depth — we estimate at ~4 chars/token.
      let thinkingTokens = 0;
      let redacted = false;
      for (const block of contentArr) {
        if (block.type === 'thinking') {
          const text = (block.thinking as string) || (block.text as string) || '';
          thinkingTokens += Math.ceil(text.length / 4);
        } else if (block.type === 'redacted_thinking') {
          redacted = true;
        }
      }

      // Running context size = total prompt the model saw this turn.
      // Per Anthropic billing breakdown:
      //   - input_tokens: full-rate billed (not cached)
      //   - cache_creation_input_tokens (cacheWrite): freshly cached this turn
      //   - cache_read_input_tokens (cacheRead): cache hit
      // All three are distinct portions of the prompt. Sum of all three = full
      // window occupancy. Output is the *next* turn's input — don't add here.
      const contextAfter = inputTokens + cacheRead + cacheWrite;
      runningContext = contextAfter;
      lastTurnContext = runningContext;

      turns.push({
        type: 'assistant',
        model: turnModel || undefined,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheRead,
        cache_write_tokens: cacheWrite,
        thinking_tokens: thinkingTokens,
        thinking_redacted: redacted,
        cost_usd: cost,
        timestamp: (obj.timestamp as number) || Date.now(),
        content_types: contentTypes,
        stop_reason: (msg.stop_reason as string) || null,
        uuid: (obj.uuid as string) || '',
        context_tokens: runningContext,
      });
    }

    if (obj.type === 'user') {
      turns.push({
        type: 'user',
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        thinking_tokens: 0,
        thinking_redacted: false,
        cost_usd: 0,
        timestamp: (obj.timestamp as number) || Date.now(),
        content_types: ['user_message'],
        stop_reason: null,
        uuid: (obj.uuid as string) || '',
        context_tokens: lastTurnContext,
      });
    }
  }

  const assistantTurns = turns.filter(t => t.type === 'assistant');
  const summary: TranscriptSummary = {
    turns: assistantTurns.length,
    total_input_tokens: turns.reduce((s, t) => s + t.input_tokens, 0),
    total_output_tokens: turns.reduce((s, t) => s + t.output_tokens, 0),
    total_cache_read_tokens: turns.reduce((s, t) => s + t.cache_read_tokens, 0),
    total_cache_write_tokens: turns.reduce((s, t) => s + t.cache_write_tokens, 0),
    total_thinking_tokens: assistantTurns.reduce((s, t) => s + t.thinking_tokens, 0),
    thinking_redacted_turns: assistantTurns.filter(t => t.thinking_redacted).length,
    total_cost_usd: turns.reduce((s, t) => s + t.cost_usd, 0),
    model,
    user_messages: turns.filter(t => t.type === 'user').length,
    compaction_count: compactions.length,
  };

  return { turns, summary, compactions };
}

/**
 * Parse transcript and convert assistant turns into SpanEvent objects
 * for storage in our DB.
 */
export function transcriptToSpans(transcriptPath: string, sessionId: string): SpanEvent[] {
  const { turns } = parseTranscript(transcriptPath);
  const spans: SpanEvent[] = [];

  for (const turn of turns) {
    if (turn.type !== 'assistant') continue;
    if (turn.output_tokens === 0 && turn.input_tokens === 0) continue;

    spans.push({
      id: generateId(),
      parent_id: null,
      session_id: sessionId,
      kind: 'llm_call',
      status: 'ok',
      source: 'claude_code_hook',
      name: `llm:${turn.model || 'unknown'}`,
      started_at: turn.timestamp,
      ended_at: turn.timestamp,
      duration_ms: null,
      input: {
        content_types: turn.content_types,
        stop_reason: turn.stop_reason,
      },
      output: null,
      model: turn.model || null,
      input_tokens: turn.input_tokens,
      output_tokens: turn.output_tokens,
      cache_read_tokens: turn.cache_read_tokens,
      cache_write_tokens: turn.cache_write_tokens,
      cost_usd: turn.cost_usd,
      error: null,
      metadata: { source: 'transcript_parse', uuid: turn.uuid },
      thinking_tokens: turn.thinking_tokens,
      thinking_redacted: turn.thinking_redacted ? 1 : 0,
      context_tokens: turn.context_tokens,
    });
  }

  return spans;
}

/**
 * Get just the summary without creating spans (lightweight for StatusBar).
 */
export function getTranscriptCost(transcriptPath: string, sessionId?: string | null): TranscriptSummary {
  const { summary } = parseTranscript(transcriptPath, sessionId);
  return summary;
}

/**
 * Build a context-size timeline for the Context view.
 * Each point = one assistant turn or compaction boundary.
 */
export function getContextTimeline(transcriptPath: string, sessionId?: string | null): ContextTimelinePoint[] {
  const { turns, compactions } = parseTranscript(transcriptPath, sessionId);

  const points: ContextTimelinePoint[] = [];
  let i = 0;
  for (const turn of turns) {
    if (turn.type !== 'assistant') continue;
    points.push({
      turn_index: i,
      timestamp: turn.timestamp,
      context_tokens: turn.context_tokens,
      compacted: false,
    });
    i++;
  }

  for (const c of compactions) {
    points.push({
      turn_index: -1,
      timestamp: c.occurred_at,
      context_tokens: c.after_tokens ?? 0,
      compacted: true,
    });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get just the compaction events for a transcript.
 */
export function getCompactionEvents(transcriptPath: string, sessionId?: string | null): CompactionEvent[] {
  const { compactions } = parseTranscript(transcriptPath, sessionId);
  return compactions;
}

function emptySummary(): TranscriptSummary {
  return {
    turns: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    total_thinking_tokens: 0,
    thinking_redacted_turns: 0,
    total_cost_usd: 0,
    model: null,
    user_messages: 0,
    compaction_count: 0,
  };
}
