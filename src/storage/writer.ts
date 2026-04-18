import type Database from 'better-sqlite3';
import type { SpanEvent, CollectorSource } from '../types/events.js';

const MAX_OUTPUT_SIZE = 10 * 1024; // 10KB

interface CreateSessionParams {
  session_id: string;
  source: CollectorSource;
  started_at: number;
  cwd?: string;
  metadata?: Record<string, unknown>;
}

export class EventWriter {
  private insertSessionStmt: Database.Statement;
  private endSessionStmt: Database.Statement;
  private insertSpanStmt: Database.Statement;
  private updateSpanStmt: Database.Statement;
  private findPendingSpanStmt: Database.Statement;
  private findActiveAgentStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertSessionStmt = db.prepare(`
      INSERT OR IGNORE INTO sessions (session_id, source, started_at, cwd, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.endSessionStmt = db.prepare(`
      UPDATE sessions SET ended_at = ? WHERE session_id = ?
    `);

    this.insertSpanStmt = db.prepare(`
      INSERT INTO spans (
        id, parent_id, session_id, kind, status, source, name,
        started_at, ended_at, duration_ms, input, output, model,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        cost_usd, error, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    this.updateSpanStmt = db.prepare(`
      UPDATE spans SET
        status = COALESCE(?, status),
        ended_at = COALESCE(?, ended_at),
        duration_ms = COALESCE(?, duration_ms),
        output = COALESCE(?, output),
        input_tokens = COALESCE(?, input_tokens),
        output_tokens = COALESCE(?, output_tokens),
        cache_read_tokens = COALESCE(?, cache_read_tokens),
        cache_write_tokens = COALESCE(?, cache_write_tokens),
        cost_usd = COALESCE(?, cost_usd),
        error = COALESCE(?, error),
        model = COALESCE(?, model)
      WHERE id = ?
    `);

    this.findPendingSpanStmt = db.prepare(`
      SELECT id FROM spans
      WHERE session_id = ? AND name = ? AND status = 'pending'
      ORDER BY started_at DESC LIMIT 1
    `);

    this.findActiveAgentStmt = db.prepare(`
      SELECT id FROM spans
      WHERE session_id = ? AND name = 'Agent' AND status = 'pending'
      ORDER BY started_at DESC LIMIT 1
    `);
  }

  createSession(params: CreateSessionParams): void {
    this.insertSessionStmt.run(
      params.session_id,
      params.source,
      params.started_at,
      params.cwd ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null
    );
  }

  endSession(sessionId: string, endedAt: number): void {
    this.endSessionStmt.run(endedAt, sessionId);
  }

  insertSpan(span: SpanEvent): void {
    this.insertSpanStmt.run(
      span.id,
      span.parent_id,
      span.session_id,
      span.kind,
      span.status,
      span.source,
      span.name,
      span.started_at,
      span.ended_at,
      span.duration_ms,
      span.input ? JSON.stringify(span.input) : null,
      truncateJson(span.output),
      span.model,
      span.input_tokens,
      span.output_tokens,
      span.cache_read_tokens,
      span.cache_write_tokens,
      span.cost_usd,
      span.error,
      span.metadata ? JSON.stringify(span.metadata) : null
    );
  }

  updateSpan(
    id: string,
    updates: Partial<Pick<SpanEvent, 'status' | 'ended_at' | 'duration_ms' | 'output' | 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens' | 'cost_usd' | 'error' | 'model'>>
  ): void {
    this.updateSpanStmt.run(
      updates.status ?? null,
      updates.ended_at ?? null,
      updates.duration_ms ?? null,
      updates.output ? truncateJson(updates.output) : null,
      updates.input_tokens ?? null,
      updates.output_tokens ?? null,
      updates.cache_read_tokens ?? null,
      updates.cache_write_tokens ?? null,
      updates.cost_usd ?? null,
      updates.error ?? null,
      updates.model ?? null,
      id
    );
  }

  findPendingSpan(sessionId: string, toolName: string): string | null {
    const row = this.findPendingSpanStmt.get(sessionId, toolName) as { id: string } | undefined;
    return row?.id ?? null;
  }

  findActiveAgent(sessionId: string): string | null {
    const row = this.findActiveAgentStmt.get(sessionId) as { id: string } | undefined;
    return row?.id ?? null;
  }
}

function truncateJson(data: unknown): string | null {
  if (data == null) return null;
  const json = JSON.stringify(data);
  if (json.length <= MAX_OUTPUT_SIZE) return json;
  return JSON.stringify({ _truncated: true, _size: json.length, _preview: json.slice(0, 1000) });
}
