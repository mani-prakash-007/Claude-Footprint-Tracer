import { useState, useEffect, useRef } from 'react';
import type { SpanEvent } from '../../types/events.js';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';

export function useEvents(sessionId: string | null, pollInterval = 100) {
  const [events, setEvents] = useState<SpanEvent[]>([]);
  const readerRef = useRef<EventReader | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;

    const db = createDatabase();
    const reader = new EventReader(db);
    readerRef.current = reader;

    // Initial load
    const initial = reader.getSessionSpans(sessionId);
    setEvents(initial);

    const interval = setInterval(() => {
      // Full refresh every poll — catches both new inserts AND updates (PostToolUse)
      // For sessions <1000 spans this is <5ms on SQLite
      const current = reader.getSessionSpans(sessionId);
      pollCountRef.current++;

      setEvents((prev) => {
        // Quick equality check — skip re-render if nothing changed
        if (prev.length === current.length && prev.length > 0) {
          const lastPrev = prev[prev.length - 1];
          const lastCurr = current[current.length - 1];
          if (lastPrev.id === lastCurr.id && lastPrev.status === lastCurr.status) {
            // Check if any pending span got updated
            const hasPending = prev.some(s => s.status === 'pending');
            if (!hasPending) return prev;
          }
        }
        return current;
      });
    }, pollInterval);

    return () => {
      clearInterval(interval);
      db.close();
    };
  }, [sessionId, pollInterval]);

  return events;
}
