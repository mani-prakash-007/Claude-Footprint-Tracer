import { useState, useEffect } from 'react';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';
import type { SessionMetrics } from '../../types/events.js';

/**
 * Pull the most recent N sessions with rolled-up metrics for the Trends view.
 * Polls so live session updates appear in trends. Closes the DB connection
 * after each tick (cheap with WAL).
 */
export function useSessionMetrics(limit = 20, pollInterval = 5000): SessionMetrics[] {
  const [metrics, setMetrics] = useState<SessionMetrics[]>([]);

  useEffect(() => {
    const fetch = () => {
      const db = createDatabase();
      const reader = new EventReader(db);
      try {
        setMetrics(reader.listRecentSessionsWithMetrics(limit));
      } finally {
        db.close();
      }
    };
    fetch();
    const interval = setInterval(fetch, pollInterval);
    return () => clearInterval(interval);
  }, [limit, pollInterval]);

  return metrics;
}
