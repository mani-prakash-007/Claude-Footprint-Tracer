/**
 * Comprehensive fixture seeder for end-to-end TUI testing.
 *
 * `seedComprehensiveSession(db, transcriptPath)` populates a fresh DB +
 * transcript JSONL covering every TUI surface:
 *   - subAgentTree    → AgentTreeView, ConsoleView nesting
 *   - redactedThinking → TokenView Thinking panel
 *   - cacheBreakage   → TokenView cache panel + breakage alert
 *   - redundantReads  → FileHeatmapView + Console loop warning
 *   - compactionLoop  → ContextView markers
 *   - multiSession    → TrendsView sparklines
 *
 * Usage:
 *   const db = createDatabase('/tmp/atrace-fixture.db');
 *   const tp = '/tmp/atrace-fixture.jsonl';
 *   seedComprehensiveSession(db, tp);
 *   // Launch atrace with AGENT_TRACE_DB=/tmp/atrace-fixture.db
 */

import type Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { EventWriter } from '../../src/storage/writer.js';
import type { SpanEvent } from '../../src/types/events.js';

export interface SeedOptions {
  sessionId?: string;
  baseTime?: number;
  scenarios?: Array<
    | 'subAgentTree'
    | 'redactedThinking'
    | 'cacheBreakage'
    | 'redundantReads'
    | 'compactionLoop'
    | 'multiSession'
  >;
}

export interface SeedResult {
  sessionId: string;
  transcriptPath: string;
}

function mkSpan(p: Partial<SpanEvent>): SpanEvent {
  return {
    id: 'span-' + Math.random().toString(36).slice(2),
    parent_id: null,
    session_id: 'sess-fixture',
    kind: 'tool_use',
    status: 'ok',
    source: 'claude_code_hook',
    name: 'Read',
    started_at: Date.now(),
    ended_at: null,
    duration_ms: 50,
    input: null,
    output: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    cost_usd: null,
    error: null,
    metadata: null,
    ...p,
  };
}

function assistantTurn(ts: number, opts: {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read?: number;
  cache_write?: number;
  thinking_text?: string;
  redacted?: boolean;
  toolUse?: Array<{ id: string; name: string; input: unknown }>;
} = {}) {
  const content: Array<Record<string, unknown>> = [];
  if (opts.thinking_text) content.push({ type: 'thinking', thinking: opts.thinking_text });
  if (opts.redacted) content.push({ type: 'redacted_thinking', data: 'redacted' });
  content.push({ type: 'text', text: 'response' });
  for (const t of opts.toolUse ?? []) {
    content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
  }
  return {
    type: 'assistant',
    uuid: `a-${ts}`,
    timestamp: ts,
    message: {
      model: opts.model ?? 'claude-opus-4-7',
      usage: {
        input_tokens: opts.input_tokens ?? 100,
        output_tokens: opts.output_tokens ?? 50,
        cache_read_input_tokens: opts.cache_read ?? 0,
        cache_creation_input_tokens: opts.cache_write ?? 0,
      },
      content,
      stop_reason: 'end_turn',
    },
  };
}

function userTurn(ts: number, results: Array<{ id: string; content: string }> = []) {
  const content: Array<Record<string, unknown>> = [];
  for (const r of results) {
    content.push({ type: 'tool_result', tool_use_id: r.id, content: r.content });
  }
  if (content.length === 0) content.push({ type: 'text', text: 'user prompt' });
  return {
    type: 'user',
    uuid: `u-${ts}`,
    timestamp: ts,
    message: { role: 'user', content },
  };
}

export function seedComprehensiveSession(
  db: Database.Database,
  transcriptPath: string,
  opts: SeedOptions = {}
): SeedResult {
  const writer = new EventWriter(db);
  const sid = opts.sessionId ?? 'sess-fixture';
  const t0 = opts.baseTime ?? Date.now() - 60 * 60 * 1000;
  const enabled = new Set(
    opts.scenarios ?? [
      'subAgentTree',
      'redactedThinking',
      'cacheBreakage',
      'redundantReads',
      'compactionLoop',
      'multiSession',
    ]
  );

  writer.createSession({
    session_id: sid,
    source: 'claude_code_hook',
    started_at: t0,
    cwd: '/tmp/fixture',
    metadata: { transcript_path: transcriptPath },
  });

  const lines: object[] = [];

  // user prompt to anchor the session
  lines.push(userTurn(t0));

  if (enabled.has('subAgentTree')) {
    const agentId = 'agent-1';
    writer.insertSpan(
      mkSpan({
        id: agentId,
        session_id: sid,
        name: 'Agent',
        kind: 'custom_step',
        started_at: t0 + 1_000,
        ended_at: t0 + 6_000,
        duration_ms: 5_000,
        input: { description: 'refactor auth module', subagent_type: 'general' },
        cost_usd: 0.4,
      })
    );
    for (const [i, name] of ['Read', 'Grep', 'Edit', 'Bash'].entries()) {
      writer.insertSpan(
        mkSpan({
          parent_id: agentId,
          session_id: sid,
          name,
          started_at: t0 + 1_500 + i * 200,
          ended_at: t0 + 1_700 + i * 200,
          duration_ms: 200,
          status: i === 3 ? 'error' : 'ok',
          input: { command: name === 'Bash' ? 'npm test' : undefined, file_path: '/src/auth/login.ts' },
          cost_usd: 0.02,
        })
      );
    }
  }

  if (enabled.has('redundantReads')) {
    for (let i = 0; i < 5; i++) {
      writer.insertSpan(
        mkSpan({
          session_id: sid,
          name: 'Read',
          started_at: t0 + 10_000 + i * 1_000,
          ended_at: t0 + 10_100 + i * 1_000,
          duration_ms: 100,
          input: { file_path: '/src/utils/helpers.ts' },
          input_token_attribution: 80,
          output_token_attribution: 4_000,
          attribution_method: 'heuristic',
        })
      );
      writer.upsertFileAccess(sid, '/src/utils/helpers.ts', 'Read', t0 + 10_000 + i * 1_000);
    }
  }

  if (enabled.has('redactedThinking')) {
    lines.push(
      assistantTurn(t0 + 20_000, {
        thinking_text: 'thinking deeply '.repeat(50),
        input_tokens: 1_000,
        output_tokens: 200,
      })
    );
    lines.push(
      assistantTurn(t0 + 21_000, {
        redacted: true,
        input_tokens: 1_000,
        output_tokens: 200,
      })
    );
  }

  if (enabled.has('cacheBreakage')) {
    for (let i = 0; i < 12; i++) {
      lines.push(
        assistantTurn(t0 + 30_000 + i * 1_000, {
          input_tokens: 200,
          output_tokens: 50,
          cache_read: 9_000,
        })
      );
    }
    for (let i = 0; i < 12; i++) {
      lines.push(
        assistantTurn(t0 + 50_000 + i * 1_000, {
          input_tokens: 9_500,
          output_tokens: 50,
          cache_read: 100,
        })
      );
    }
  }

  if (enabled.has('compactionLoop')) {
    lines.push(
      assistantTurn(t0 + 70_000, {
        input_tokens: 180_000,
        output_tokens: 800,
      })
    );
    lines.push({
      type: 'system',
      subtype: 'compact_boundary',
      timestamp: t0 + 71_000,
      afterTokens: 8_000,
    });
    lines.push(
      assistantTurn(t0 + 72_000, {
        input_tokens: 8_500,
        output_tokens: 200,
      })
    );
    writer.insertCompactionEvent({
      id: 'comp-1',
      session_id: sid,
      occurred_at: t0 + 71_000,
      before_tokens: 180_800,
      after_tokens: 8_000,
      trigger: 'auto',
      metadata: null,
    });
  }

  if (enabled.has('multiSession')) {
    for (let i = 0; i < 4; i++) {
      const prevSid = `sess-prev-${i}`;
      writer.createSession({
        session_id: prevSid,
        source: 'claude_code_hook',
        started_at: t0 - (i + 1) * 86_400_000,
      });
      writer.insertSpan(
        mkSpan({
          session_id: prevSid,
          name: 'Read',
          started_at: t0 - (i + 1) * 86_400_000,
          ended_at: t0 - (i + 1) * 86_400_000 + 100,
          input_tokens: 1_000 * (i + 1),
          output_tokens: 200 * (i + 1),
          cost_usd: 0.05 * (i + 1),
        })
      );
    }
  }

  writer.endSession(sid, t0 + 100_000);

  writeFileSync(transcriptPath, lines.map((l) => JSON.stringify(l) + '\n').join(''));

  return { sessionId: sid, transcriptPath };
}
