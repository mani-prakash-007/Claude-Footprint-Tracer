import type Database from 'better-sqlite3';
import type { SpanEvent, SessionSummary, TokenBreakdown } from '../types/events.js';
import type { SpanRow } from '../types/database.js';

export class EventReader {
  private spansSinceStmt: Database.Statement;
  private sessionSpansStmt: Database.Statement;
  private listSessionsStmt: Database.Statement;
  private getSpanStmt: Database.Statement;
  private tokenBreakdownStmt: Database.Statement;
  private latestSessionStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.spansSinceStmt = db.prepare(`
      SELECT *, rowid FROM spans
      WHERE session_id = ? AND rowid > ?
      ORDER BY rowid ASC
    `);

    this.sessionSpansStmt = db.prepare(`
      SELECT *, rowid FROM spans
      WHERE session_id = ?
      ORDER BY started_at ASC
    `);

    this.listSessionsStmt = db.prepare(`
      SELECT
        s.session_id,
        s.source,
        s.started_at,
        s.ended_at,
        COUNT(sp.id) as span_count,
        COALESCE(SUM(sp.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(sp.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(sp.cost_usd), 0) as total_cost_usd
      FROM sessions s
      LEFT JOIN spans sp ON sp.session_id = s.session_id
      GROUP BY s.session_id
      ORDER BY s.started_at DESC
      LIMIT ?
    `);

    this.getSpanStmt = db.prepare(`SELECT *, rowid FROM spans WHERE id = ?`);

    this.tokenBreakdownStmt = db.prepare(`
      SELECT id as span_id, name, model, input_tokens, output_tokens,
             cache_read_tokens, cache_write_tokens, cost_usd
      FROM spans
      WHERE session_id = ? AND kind = 'llm_call'
      ORDER BY started_at ASC
    `);

    this.latestSessionStmt = db.prepare(`
      SELECT
        s.session_id,
        s.source,
        s.started_at,
        s.ended_at,
        COUNT(sp.id) as span_count,
        COALESCE(SUM(sp.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(sp.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(sp.cost_usd), 0) as total_cost_usd
      FROM sessions s
      LEFT JOIN spans sp ON sp.session_id = s.session_id
      GROUP BY s.session_id
      ORDER BY s.started_at DESC
      LIMIT 1
    `);
  }

  getSpansSince(sessionId: string, lastRowId: number): { spans: SpanEvent[]; newLastRowId: number } {
    const rows = this.spansSinceStmt.all(sessionId, lastRowId) as SpanRow[];
    if (rows.length === 0) return { spans: [], newLastRowId: lastRowId };

    const spans = rows.map(rowToSpan);
    const newLastRowId = rows[rows.length - 1].rowid!;
    return { spans, newLastRowId };
  }

  getSessionSpans(sessionId: string): SpanEvent[] {
    const rows = this.sessionSpansStmt.all(sessionId) as SpanRow[];
    return rows.map(rowToSpan);
  }

  listSessions(limit = 50): SessionSummary[] {
    const rows = this.listSessionsStmt.all(limit) as Array<{
      session_id: string;
      source: string;
      started_at: number;
      ended_at: number | null;
      span_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
    }>;

    return rows.map((r) => ({
      session_id: r.session_id,
      source: r.source as SessionSummary['source'],
      started_at: r.started_at,
      ended_at: r.ended_at,
      span_count: r.span_count,
      total_input_tokens: r.total_input_tokens,
      total_output_tokens: r.total_output_tokens,
      total_cost_usd: r.total_cost_usd,
      tool_names: [],
    }));
  }

  getSpan(spanId: string): SpanEvent | null {
    const row = this.getSpanStmt.get(spanId) as SpanRow | undefined;
    return row ? rowToSpan(row) : null;
  }

  getTokenBreakdown(sessionId: string): TokenBreakdown[] {
    return this.tokenBreakdownStmt.all(sessionId) as TokenBreakdown[];
  }

  getLatestSession(): SessionSummary | null {
    const row = this.latestSessionStmt.get() as {
      session_id: string;
      source: string;
      started_at: number;
      ended_at: number | null;
      span_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
    } | undefined;

    if (!row) return null;

    return {
      session_id: row.session_id,
      source: row.source as SessionSummary['source'],
      started_at: row.started_at,
      ended_at: row.ended_at,
      span_count: row.span_count,
      total_input_tokens: row.total_input_tokens,
      total_output_tokens: row.total_output_tokens,
      total_cost_usd: row.total_cost_usd,
      tool_names: [],
    };
  }

  close(): void {
    this.db.close();
  }
}

function rowToSpan(row: SpanRow): SpanEvent {
  return {
    id: row.id,
    parent_id: row.parent_id,
    session_id: row.session_id,
    kind: row.kind as SpanEvent['kind'],
    status: row.status as SpanEvent['status'],
    source: row.source as SpanEvent['source'],
    name: row.name,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_ms: row.duration_ms,
    input: row.input ? JSON.parse(row.input) : null,
    output: row.output ? JSON.parse(row.output) : null,
    model: row.model,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cache_read_tokens: row.cache_read_tokens,
    cache_write_tokens: row.cache_write_tokens,
    cost_usd: row.cost_usd,
    error: row.error,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}
