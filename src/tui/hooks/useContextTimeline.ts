import { useState, useEffect, useRef } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import {
  getContextTimeline,
  type ContextTimelinePoint,
} from '../../collector/claude-code/transcript-parser.js';
import type { CompactionEvent } from '../../types/events.js';

export interface ContextTimelineState {
  points: ContextTimelinePoint[];
  compactions: CompactionEvent[];
  current_tokens: number;
  peak_tokens: number;
}

/**
 * Poll transcript for context-window timeline + compaction events.
 * Mirrors useTranscriptCost: 2s polling cadence, transcript path resolved
 * from session metadata once.
 */
export function useContextTimeline(
  sessionId: string | null,
  pollInterval = 2000
): ContextTimelineState {
  const [state, setState] = useState<ContextTimelineState>({
    points: [],
    compactions: [],
    current_tokens: 0,
    peak_tokens: 0,
  });
  const transcriptPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const db = createDatabase();
    const reader = new EventReader(db);
    const metadata = reader.getSessionMetadata(sessionId);
    const dbCompactions = reader.getCompactionEvents(sessionId);
    db.close();

    const transcriptPath = metadata?.transcript_path as string | undefined;
    if (!transcriptPath) {
      setState((prev) => ({ ...prev, compactions: dbCompactions }));
      return;
    }

    transcriptPathRef.current = transcriptPath;

    const refresh = () => {
      if (!transcriptPathRef.current) return;
      const points = getContextTimeline(transcriptPathRef.current, sessionId);
      const current = points.length > 0 ? points[points.length - 1].context_tokens : 0;
      const peak = points.reduce((max, p) => Math.max(max, p.context_tokens), 0);
      const compacts: CompactionEvent[] = points
        .filter((p) => p.compacted)
        .map((p) => ({
          id: `inline-${p.timestamp}`,
          session_id: sessionId,
          occurred_at: p.timestamp,
          before_tokens: null,
          after_tokens: p.context_tokens,
          trigger: 'auto',
          metadata: null,
        }));
      setState({
        points,
        compactions: compacts.length > 0 ? compacts : dbCompactions,
        current_tokens: current,
        peak_tokens: peak,
      });
    };

    refresh();
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [sessionId, pollInterval]);

  return state;
}
