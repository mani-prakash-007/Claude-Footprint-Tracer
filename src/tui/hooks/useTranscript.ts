import { useState, useEffect, useRef } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import {
  parseTranscript,
  type TranscriptTurn,
  type TranscriptSummary,
  type ContextTimelinePoint,
} from '../../collector/claude-code/transcript-parser.js';
import type { CompactionEvent } from '../../types/events.js';
import { generateId } from '../../util/id.js';

export interface TranscriptState {
  turns: TranscriptTurn[];
  summary: TranscriptSummary | null;
  contextTimeline: ContextTimelinePoint[];
  compactions: CompactionEvent[];
  contextCurrent: number;
  contextPeak: number;
}

const EMPTY: TranscriptState = {
  turns: [],
  summary: null,
  contextTimeline: [],
  compactions: [],
  contextCurrent: 0,
  contextPeak: 0,
};

/**
 * Single source of truth for everything derived from the transcript JSONL.
 * Replaces useTranscriptCost + useTranscriptTurns and the transcript half
 * of useContextTimeline. One parse per tick (cached incrementally).
 */
export function useTranscript(
  sessionId: string | null,
  pollInterval = 2000
): TranscriptState {
  const [state, setState] = useState<TranscriptState>(EMPTY);
  const transcriptPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState(EMPTY);
      return;
    }

    const db = createDatabase();
    const reader = new EventReader(db);
    const metadata = reader.getSessionMetadata(sessionId);
    db.close();

    const transcriptPath = metadata?.transcript_path as string | undefined;
    if (!transcriptPath) {
      setState(EMPTY);
      return;
    }

    transcriptPathRef.current = transcriptPath;

    const refresh = () => {
      const path = transcriptPathRef.current;
      if (!path) return;

      const parsed = parseTranscript(path);

      const points: ContextTimelinePoint[] = [];
      let turnIdx = 0;
      let peak = 0;
      for (const turn of parsed.turns) {
        if (turn.type !== 'assistant') continue;
        if (turn.context_tokens > peak) peak = turn.context_tokens;
        points.push({
          turn_index: turnIdx++,
          timestamp: turn.timestamp,
          context_tokens: turn.context_tokens,
          compacted: false,
        });
      }
      for (const c of parsed.compactions) {
        const ctx = c.after_tokens ?? 0;
        if (ctx > peak) peak = ctx;
        points.push({
          turn_index: -1,
          timestamp: c.occurred_at,
          context_tokens: ctx,
          compacted: true,
        });
      }
      points.sort((a, b) => a.timestamp - b.timestamp);

      const lastTurn = points.filter((p) => !p.compacted).pop();
      const current = lastTurn?.context_tokens ?? 0;

      const compactions: CompactionEvent[] = parsed.compactions.length > 0
        ? parsed.compactions
        : points.filter((p) => p.compacted).map((p, i) => ({
            id: `${sessionId}-compact-${i}-${generateId()}`,
            session_id: sessionId,
            occurred_at: p.timestamp,
            before_tokens: null,
            after_tokens: p.context_tokens,
            trigger: 'auto',
          }));

      setState({
        turns: parsed.turns,
        summary: parsed.summary,
        contextTimeline: points,
        compactions,
        contextCurrent: current,
        contextPeak: peak,
      });
    };

    refresh();
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [sessionId, pollInterval]);

  return state;
}
