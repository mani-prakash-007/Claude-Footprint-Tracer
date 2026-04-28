import { useState, useEffect, useRef } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import { getTranscriptCost, type TranscriptSummary } from '../../collector/claude-code/transcript-parser.js';

/**
 * Poll transcript file for real-time cost tracking.
 * Only parses every 2 seconds (transcript parsing is heavier than DB polling).
 */
export function useTranscriptCost(sessionId: string | null, pollInterval = 2000): TranscriptSummary | null {
  const [summary, setSummary] = useState<TranscriptSummary | null>(null);
  const transcriptPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Get transcript_path from session metadata
    const db = createDatabase();
    const reader = new EventReader(db);
    const metadata = reader.getSessionMetadata(sessionId);
    db.close();

    const transcriptPath = metadata?.transcript_path as string | undefined;
    if (!transcriptPath) return;

    transcriptPathRef.current = transcriptPath;

    // Initial parse — filter to current session so multi-resume transcripts
    // don't conflate cost across earlier sessions stored in the same file.
    const initial = getTranscriptCost(transcriptPath, sessionId);
    setSummary(initial);

    const interval = setInterval(() => {
      if (!transcriptPathRef.current) return;
      const updated = getTranscriptCost(transcriptPathRef.current, sessionId);
      setSummary(updated);
    }, pollInterval);

    return () => clearInterval(interval);
  }, [sessionId, pollInterval]);

  return summary;
}
