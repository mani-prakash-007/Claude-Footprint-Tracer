import type Database from 'better-sqlite3';
import type {
  SpanEvent,
  SessionSummary,
  TokenBreakdown,
  CompactionEvent,
  FileAccessRow,
  SessionMetrics,
} from '../types/events.js';
import type { SpanRow, CompactionRow } from '../types/database.js';

export class EventReader {
  private spansSinceStmt: Database.Statement;
  private sessionSpansStmt: Database.Statement;
  private listSessionsStmt: Database.Statement;
  private getSpanStmt: Database.Statement;
  private tokenBreakdownStmt: Database.Statement;
  private latestSessionStmt: Database.Statement;
  private fileHeatmapStmt: Database.Statement;
  private compactionStmt: Database.Statement;
  private sessionMetricsStmt: Database.Statement;
  private recentMetricsStmt: Database.Statement;
  private getSpanByToolUseIdStmt: Database.Statement;

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

    this.fileHeatmapStmt = db.prepare(`
      SELECT file_path, tool_name, access_count, last_seen_at
      FROM file_access_counts
      WHERE session_id = ?
      ORDER BY access_count DESC
      LIMIT 200
    `);

    this.compactionStmt = db.prepare(`
      SELECT id, session_id, occurred_at, before_tokens, after_tokens, trigger, metadata
      FROM compaction_events
      WHERE session_id = ?
      ORDER BY occurred_at ASC
    `);

    this.sessionMetricsStmt = db.prepare(`
      SELECT
        s.session_id,
        s.started_at,
        s.ended_at,
        COUNT(sp.id) as span_count,
        SUM(CASE WHEN sp.kind = 'llm_call' THEN 1 ELSE 0 END) as llm_call_count,
        COALESCE(SUM(sp.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(sp.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(sp.cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(sp.cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(SUM(sp.cost_usd), 0) as total_cost_usd,
        COALESCE(SUM(sp.thinking_tokens), 0) as thinking_tokens,
        SUM(CASE WHEN sp.thinking_redacted = 1 THEN 1 ELSE 0 END) as redacted_turns,
        (SELECT COUNT(*) FROM compaction_events ce WHERE ce.session_id = s.session_id) as compaction_count
      FROM sessions s
      LEFT JOIN spans sp ON sp.session_id = s.session_id
      WHERE s.session_id = ?
      GROUP BY s.session_id
    `);

    this.getSpanByToolUseIdStmt = db.prepare(`
      SELECT id, input_token_attribution, output_token_attribution
      FROM spans WHERE tool_use_id = ?
    `);

    this.recentMetricsStmt = db.prepare(`
      SELECT
        s.session_id,
        s.started_at,
        s.ended_at,
        COUNT(sp.id) as span_count,
        SUM(CASE WHEN sp.kind = 'llm_call' THEN 1 ELSE 0 END) as llm_call_count,
        COALESCE(SUM(sp.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(sp.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(sp.cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(sp.cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(SUM(sp.cost_usd), 0) as total_cost_usd,
        COALESCE(SUM(sp.thinking_tokens), 0) as thinking_tokens,
        SUM(CASE WHEN sp.thinking_redacted = 1 THEN 1 ELSE 0 END) as redacted_turns,
        (SELECT COUNT(*) FROM compaction_events ce WHERE ce.session_id = s.session_id) as compaction_count
      FROM sessions s
      LEFT JOIN spans sp ON sp.session_id = s.session_id
      GROUP BY s.session_id
      ORDER BY s.started_at DESC
      LIMIT ?
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

  getSessionMetadata(sessionId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT metadata FROM sessions WHERE session_id = ?').get(sessionId) as { metadata: string | null } | undefined;
    if (!row?.metadata) return null;
    try {
      return JSON.parse(row.metadata);
    } catch {
      return null;
    }
  }

  getFileHeatmap(sessionId: string): FileAccessRow[] {
    return this.fileHeatmapStmt.all(sessionId) as FileAccessRow[];
  }

  getSpanByToolUseId(toolUseId: string): { id: string; input_token_attribution: number | null; output_token_attribution: number | null } | null {
    const row = this.getSpanByToolUseIdStmt.get(toolUseId) as
      | { id: string; input_token_attribution: number | null; output_token_attribution: number | null }
      | undefined;
    return row ?? null;
  }

  getCompactionEvents(sessionId: string): CompactionEvent[] {
    const rows = this.compactionStmt.all(sessionId) as CompactionRow[];
    return rows.map(rowToCompaction);
  }

  getSessionMetrics(sessionId: string): SessionMetrics | null {
    const row = this.sessionMetricsStmt.get(sessionId) as MetricsRow | undefined;
    return row ? rowToMetrics(row) : null;
  }

  listRecentSessionsWithMetrics(limit = 20): SessionMetrics[] {
    const rows = this.recentMetricsStmt.all(limit) as MetricsRow[];
    return rows.map(rowToMetrics);
  }

  close(): void {
    this.db.close();
  }
}

interface MetricsRow {
  session_id: string;
  started_at: number;
  ended_at: number | null;
  span_count: number;
  llm_call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost_usd: number;
  thinking_tokens: number;
  redacted_turns: number;
  compaction_count: number;
}

function rowToMetrics(row: MetricsRow): SessionMetrics {
  const cacheReads = row.total_cache_read_tokens;
  const billedInput = row.total_input_tokens;
  const cacheDenom = cacheReads + billedInput;
  return {
    session_id: row.session_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    total_cost_usd: row.total_cost_usd,
    total_input_tokens: row.total_input_tokens,
    total_output_tokens: row.total_output_tokens,
    total_cache_read_tokens: row.total_cache_read_tokens,
    total_cache_write_tokens: row.total_cache_write_tokens,
    span_count: row.span_count,
    llm_call_count: row.llm_call_count,
    thinking_tokens: row.thinking_tokens,
    redaction_rate: row.llm_call_count > 0 ? row.redacted_turns / row.llm_call_count : 0,
    cache_hit_rate: cacheDenom > 0 ? cacheReads / cacheDenom : 0,
    loop_warning_count: 0,
    compaction_count: row.compaction_count,
  };
}

function rowToCompaction(row: CompactionRow): CompactionEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    occurred_at: row.occurred_at,
    before_tokens: row.before_tokens,
    after_tokens: row.after_tokens,
    trigger: (row.trigger as CompactionEvent['trigger']) ?? 'unknown',
    metadata: row.metadata ? safeParse(row.metadata) : null,
  };
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
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
    thinking_tokens: row.thinking_tokens,
    thinking_redacted: row.thinking_redacted,
    context_tokens: row.context_tokens,
    tool_use_id: row.tool_use_id,
    input_token_attribution: row.input_token_attribution,
    output_token_attribution: row.output_token_attribution,
    attribution_method: row.attribution_method as 'heuristic' | 'count_tokens' | null,
  };
}
