import type { CollectorSource } from './events.js';

export interface Session {
  session_id: string;
  source: CollectorSource;
  started_at: number;
  ended_at: number | null;
  cwd: string | null;
  metadata: Record<string, unknown> | null;
}
