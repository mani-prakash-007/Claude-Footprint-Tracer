import { useEffect, useRef } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import { EventWriter } from '../../storage/writer.js';
import {
  attributeTokens,
  heuristicEstimator,
} from '../../collector/claude-code/token-attribution.js';

/**
 * Tick-driven token attribution. Once per `pollInterval` (default 2s):
 *   1. Resolve transcript_path from session metadata.
 *   2. Walk JSONL, extract every tool_use → tool_result block pair.
 *   3. Match to spans via tool_use_id; fill input/output attribution
 *      columns with heuristic estimates.
 *
 * Idempotent: spans with attribution already set are skipped. Output-only
 * attribution is filled in on a later tick if the matching tool_result hasn't
 * been written yet.
 *
 * Side-effect-only hook — UI reads attribution columns from spans via
 * useEvents.
 */
export function useTokenAttribution(sessionId: string | null, pollInterval = 2000): void {
  const transcriptPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const db = createDatabase();
    const reader = new EventReader(db);
    const writer = new EventWriter(db);

    const metadata = reader.getSessionMetadata(sessionId);
    const transcriptPath = metadata?.transcript_path as string | undefined;
    if (!transcriptPath) {
      db.close();
      return;
    }
    transcriptPathRef.current = transcriptPath;

    const tick = () => {
      if (!transcriptPathRef.current) return;
      try {
        attributeTokens(
          transcriptPathRef.current,
          {
            getSpan: (id) => reader.getSpanByToolUseId(id),
            updateSpan: (spanId, input, output, method) => {
              writer.updateSpanAttribution(spanId, input, output, method);
            },
          },
          heuristicEstimator
        );
      } catch {
        // never let attribution crash the TUI
      }
    };

    tick();
    const interval = setInterval(tick, pollInterval);
    return () => {
      clearInterval(interval);
      db.close();
    };
  }, [sessionId, pollInterval]);
}
