import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '../../src/storage/database.js';
import { EventReader } from '../../src/storage/reader.js';
import { seedComprehensiveSession } from './seed.js';

const DIR = join(import.meta.dirname, '../../tmp-test-seed');

beforeEach(() => mkdirSync(DIR, { recursive: true }));
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe('seedComprehensiveSession', () => {
  it('seeds DB + transcript covering every scenario', () => {
    const dbPath = join(DIR, 'fixture.db');
    const tp = join(DIR, 'transcript.jsonl');
    const db = createDatabase(dbPath);
    const result = seedComprehensiveSession(db, tp);

    expect(result.sessionId).toBe('sess-fixture');
    expect(existsSync(tp)).toBe(true);

    const reader = new EventReader(db);
    const spans = reader.getSessionSpans(result.sessionId);
    expect(spans.length).toBeGreaterThan(5);

    const compactions = reader.getCompactionEvents(result.sessionId);
    expect(compactions.length).toBeGreaterThanOrEqual(1);

    const heat = reader.getFileHeatmap(result.sessionId);
    expect(heat.find((r) => r.tool_name === 'Read')?.access_count).toBeGreaterThanOrEqual(5);

    db.close();
  });

  it('respects scenario filter', () => {
    const dbPath = join(DIR, 'minimal.db');
    const tp = join(DIR, 'minimal.jsonl');
    const db = createDatabase(dbPath);
    seedComprehensiveSession(db, tp, { scenarios: ['subAgentTree'] });

    const reader = new EventReader(db);
    const spans = reader.getSessionSpans('sess-fixture');
    const agents = spans.filter((s) => s.name === 'Agent');
    expect(agents.length).toBe(1);

    const heat = reader.getFileHeatmap('sess-fixture');
    expect(heat.length).toBe(0);

    db.close();
  });
});
