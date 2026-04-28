/**
 * Per-tool-call token attribution.
 *
 * Each tool_use block in an assistant turn carries a `tool_use_id` (e.g.
 * `toolu_01abc…`). The same id appears on the matching `tool_result` block
 * in the next user turn. We match those blocks to DB spans (by tool_use_id),
 * estimate tokens for each block via a pluggable estimator, and persist
 * the attributions on the spans table.
 *
 * Truncation note: spans.output is capped at 10KB by the writer to keep
 * the DB lean. The transcript JSONL has the full untruncated tool_result.
 * Therefore attribution always reads from the transcript, never from
 * spans.output.
 */

import { readFileSync } from 'fs';

export interface ToolBlockExtract {
  tool_use_id: string;
  /** Raw tool_use block from the assistant turn's content[]. */
  tool_use_block: Record<string, unknown>;
  /** Matching tool_result block from the next user turn (if present yet). */
  tool_result_block: Record<string, unknown> | null;
}

export interface TokenEstimator {
  /** Returns estimated tokens for one content block. */
  estimate(block: Record<string, unknown>): number;
  readonly method: 'heuristic' | 'count_tokens';
}

/**
 * Char-based heuristic. ~3.5 chars/token for code & JSON (most tool I/O),
 * ~4 chars/token for prose. We bias toward the JSON ratio because
 * tool_use.input and tool_result.content are predominantly structured.
 *
 * Empirically off the bill by ~10–15%; explicit method label lets the UI
 * disclose the approximation.
 */
export const heuristicEstimator: TokenEstimator = {
  method: 'heuristic',
  estimate(block) {
    const json = JSON.stringify(block);
    if (!json) return 0;
    return Math.max(1, Math.ceil(json.length / 3.5));
  },
};

/**
 * Walk the transcript JSONL and extract every tool_use → tool_result pair.
 * Tool_result may be missing if the next user turn hasn't been written yet
 * (race with hook PostToolUse). Caller is expected to retry on next tick.
 */
export function extractToolBlocks(transcriptPath: string): ToolBlockExtract[] {
  let content: string;
  try {
    content = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return [];
  }

  // First pass: stash all tool_use blocks by id.
  const useBlocks = new Map<string, Record<string, unknown>>();
  // Second pass via the same loop: when we hit a user message with content[],
  // walk for tool_result and pair.
  const results: ToolBlockExtract[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type === 'assistant') {
      const msg = obj.message as Record<string, unknown> | undefined;
      const contentArr = (msg?.content as Array<Record<string, unknown>>) || [];
      for (const block of contentArr) {
        if (block.type === 'tool_use') {
          const id = typeof block.id === 'string' ? block.id : '';
          if (id) useBlocks.set(id, block);
        }
      }
    }

    if (obj.type === 'user') {
      const msg = obj.message as Record<string, unknown> | undefined;
      const contentArr = (msg?.content as Array<Record<string, unknown>>) || [];
      for (const block of contentArr) {
        if (block.type === 'tool_result') {
          const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
          if (!id) continue;
          const useBlock = useBlocks.get(id);
          if (!useBlock) continue;
          results.push({
            tool_use_id: id,
            tool_use_block: useBlock,
            tool_result_block: block,
          });
          useBlocks.delete(id); // pair found
        }
      }
    }
  }

  // Tool_use blocks without a result yet — emit with null result so the
  // input contribution is still attributed.
  for (const [id, useBlock] of useBlocks) {
    results.push({
      tool_use_id: id,
      tool_use_block: useBlock,
      tool_result_block: null,
    });
  }

  return results;
}

export interface AttributionResult {
  /** Spans whose attribution columns are now filled. */
  attributed: number;
  /** Tool_use_ids in transcript with no matching span yet. */
  unmatched: number;
  /** Tool_use_ids we already filled; skipped this pass. */
  skipped: number;
}

interface AttributionDeps {
  /** Look up a span by tool_use_id. Returns existing attribution if any. */
  getSpan: (toolUseId: string) => {
    id: string;
    input_token_attribution: number | null;
    output_token_attribution: number | null;
  } | null;
  /** Persist attribution onto the span row. */
  updateSpan: (
    spanId: string,
    inputTokens: number,
    outputTokens: number | null,
    method: 'heuristic' | 'count_tokens'
  ) => void;
}

/**
 * Walk transcript, attribute each tool_use/tool_result pair to its span.
 * Idempotent: spans that already carry attribution are skipped. Output
 * attribution can be filled in a later tick if the tool_result hasn't
 * landed yet.
 */
export function attributeTokens(
  transcriptPath: string,
  deps: AttributionDeps,
  estimator: TokenEstimator = heuristicEstimator
): AttributionResult {
  const blocks = extractToolBlocks(transcriptPath);
  let attributed = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const block of blocks) {
    const span = deps.getSpan(block.tool_use_id);
    if (!span) {
      unmatched += 1;
      continue;
    }

    const hasInput = span.input_token_attribution != null;
    const hasOutput = span.output_token_attribution != null;
    const haveResult = block.tool_result_block != null;

    if (hasInput && (hasOutput || !haveResult)) {
      skipped += 1;
      continue;
    }

    const inputTokens = hasInput
      ? span.input_token_attribution!
      : estimator.estimate(block.tool_use_block);
    const outputTokens = haveResult
      ? estimator.estimate(block.tool_result_block!)
      : null;

    deps.updateSpan(span.id, inputTokens, outputTokens, estimator.method);
    attributed += 1;
  }

  return { attributed, unmatched, skipped };
}
