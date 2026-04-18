import { useState, useEffect } from 'react';
import type { SessionSummary } from '../../types/events.js';
import { createDatabase } from '../../storage/database.js';
import { EventReader } from '../../storage/reader.js';

export function useLatestSession(): SessionSummary | null {
  const [session, setSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    const db = createDatabase();
    const reader = new EventReader(db);
    const latest = reader.getLatestSession();
    setSession(latest);
    db.close();
  }, []);

  return session;
}

export function useSessions(limit = 50): SessionSummary[] {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    const db = createDatabase();
    const reader = new EventReader(db);
    setSessions(reader.listSessions(limit));
    db.close();
  }, [limit]);

  return sessions;
}
