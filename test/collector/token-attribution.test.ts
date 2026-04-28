import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  extractToolBlocks,
  attributeTokens,
  heuristicEstimator,
} from '../../src/collector/claude-code/token-attribution.js';

const TEST_DIR = join(import.meta.dirname, '../../tmp-test-attribution');

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function writeJsonl(name: string, lines: object[]): string {
  const path = join(TEST_DIR, name);
  writeFileSync(path, lines.map((l) => JSON.stringify(l) + '\n').join(''));
  return path;
}

const ASSISTANT_TOOL = (id: string, toolName: string, input: object) => ({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name: toolName, input }],
  },
});

const USER_RESULT = (id: string, content: string) => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content }],
  },
});

describe('extractToolBlocks', () => {
  it('pairs tool_use with tool_result by id', () => {
    const path = writeJsonl('basic.jsonl', [
      ASSISTANT_TOOL('toolu_1', 'Read', { file_path: '/a.ts' }),
      USER_RESULT('toolu_1', 'file contents here'),
    ]);
    const blocks = extractToolBlocks(path);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tool_use_id).toBe('toolu_1');
    expect(blocks[0].tool_result_block).not.toBeNull();
  });

  it('emits tool_use without result when result is missing yet', () => {
    const path = writeJsonl('pending.jsonl', [
      ASSISTANT_TOOL('toolu_2', 'Bash', { command: 'ls' }),
    ]);
    const blocks = extractToolBlocks(path);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tool_result_block).toBeNull();
  });

  it('handles multiple pairs in one transcript', () => {
    const path = writeJsonl('multi.jsonl', [
      ASSISTANT_TOOL('toolu_a', 'Read', { file_path: '/a.ts' }),
      USER_RESULT('toolu_a', 'a'),
      ASSISTANT_TOOL('toolu_b', 'Edit', { file_path: '/b.ts' }),
      USER_RESULT('toolu_b', 'b'),
    ]);
    const blocks = extractToolBlocks(path);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.tool_use_id).sort()).toEqual(['toolu_a', 'toolu_b']);
  });

  it('returns empty for non-existent transcript', () => {
    expect(extractToolBlocks('/no/such/file.jsonl')).toEqual([]);
  });
});

describe('heuristicEstimator', () => {
  it('returns positive token count for non-empty block', () => {
    const tokens = heuristicEstimator.estimate({ type: 'tool_use', name: 'Read' });
    expect(tokens).toBeGreaterThan(0);
  });

  it('scales with content size', () => {
    const small = heuristicEstimator.estimate({ x: 'a' });
    const big = heuristicEstimator.estimate({ x: 'a'.repeat(1000) });
    expect(big).toBeGreaterThan(small * 50);
  });

  it('reports method as heuristic', () => {
    expect(heuristicEstimator.method).toBe('heuristic');
  });
});

describe('attributeTokens', () => {
  it('attributes input + output for matched span', () => {
    const path = writeJsonl('attr.jsonl', [
      ASSISTANT_TOOL('toolu_x', 'Read', { file_path: '/a.ts' }),
      USER_RESULT('toolu_x', 'large file body'),
    ]);

    const updated: Array<{ id: string; input: number | null; output: number | null }> = [];
    const result = attributeTokens(path, {
      getSpan: (id) =>
        id === 'toolu_x'
          ? { id: 'span-1', input_token_attribution: null, output_token_attribution: null }
          : null,
      updateSpan: (id, input, output) => updated.push({ id, input, output }),
    });

    expect(result.attributed).toBe(1);
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('span-1');
    expect(updated[0].input).toBeGreaterThan(0);
    expect(updated[0].output).toBeGreaterThan(0);
  });

  it('skips spans that already have attribution', () => {
    const path = writeJsonl('skip.jsonl', [
      ASSISTANT_TOOL('toolu_y', 'Edit', { file_path: '/b.ts' }),
      USER_RESULT('toolu_y', 'ok'),
    ]);

    const result = attributeTokens(path, {
      getSpan: () => ({ id: 'span-2', input_token_attribution: 100, output_token_attribution: 50 }),
      updateSpan: () => {
        throw new Error('should not be called');
      },
    });

    expect(result.skipped).toBe(1);
    expect(result.attributed).toBe(0);
  });

  it('reports unmatched when transcript has tool_use but no DB span yet', () => {
    const path = writeJsonl('unmatched.jsonl', [
      ASSISTANT_TOOL('toolu_z', 'Bash', { command: 'ls' }),
    ]);

    const result = attributeTokens(path, {
      getSpan: () => null,
      updateSpan: () => {},
    });

    expect(result.unmatched).toBe(1);
  });
});
