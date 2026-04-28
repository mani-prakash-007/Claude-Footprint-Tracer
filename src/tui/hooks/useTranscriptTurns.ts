import { useState, useEffect, useRef } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import {
  parseTranscript,
  type TranscriptTurn,
} from '../../collector/claude-code/transcript-parser.js';

/**
 * Variant of useTranscriptCost that returns the full per-turn list for
 * deeper analytics (cache stats, thinking depth).
 */
export function useTranscriptTurns(
  sessionId: string | null,
  pollInterval = 2000
): TranscriptTurn[] {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const transcriptPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const db = createDatabase();
    const reader = new EventReader(db);
    const metadata = reader.getSessionMetadata(sessionId);
    db.close();

    const transcriptPath = metadata?.transcript_path as string | undefined;
    if (!transcriptPath) return;

    transcriptPathRef.current = transcriptPath;

    const refresh = () => {
      if (!transcriptPathRef.current) return;
      const { turns: parsed } = parseTranscript(transcriptPathRef.current, sessionId);
      setTurns(parsed);
    };

    refresh();
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [sessionId, pollInterval]);

  return turns;
}
