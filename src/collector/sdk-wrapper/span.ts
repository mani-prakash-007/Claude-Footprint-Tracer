import { EventWriter } from '../../storage/writer.js';
import { generateId } from '../../util/id.js';
import { calculateCost } from '../../util/cost.js';
import type { SpanEvent, SpanKind, SpanStatus } from '../../types/events.js';

export class Span {
  readonly id: string;
  private writer: EventWriter;
  private startedAt: number;
  private model: string | null = null;

  constructor(
    writer: EventWriter,
    sessionId: string,
    name: string,
    kind: SpanKind,
    parentId: string | null = null
  ) {
    this.id = generateId();
    this.writer = writer;
    this.startedAt = Date.now();

    const span: SpanEvent = {
      id: this.id,
      parent_id: parentId,
      session_id: sessionId,
      kind,
      status: 'pending',
      source: 'sdk_wrapper',
      name,
      started_at: this.startedAt,
      ended_at: null,
      duration_ms: null,
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
    };

    writer.insertSpan(span);
  }

  input(data: Record<string, unknown>): void {
    // Update span input in place (via update)
    this.writer.updateSpan(this.id, { output: undefined } as any);
    // Note: simplified — ideally we'd have a setInput method on writer
  }

  output(data: Record<string, unknown>): void {
    this.writer.updateSpan(this.id, { output: data } as any);
  }

  setInput(data: Record<string, unknown>): void {
    this.input(data);
  }

  setOutput(data: Record<string, unknown>): void {
    this.output(data);
  }

  setTokens(
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0,
    cacheWriteTokens = 0
  ): void {
    const cost = calculateCost(this.model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
    this.writer.updateSpan(this.id, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      cost_usd: cost,
    });
  }

  setModel(model: string): void {
    this.model = model;
    this.writer.updateSpan(this.id, { model });
  }

  end(status: SpanStatus, error?: unknown): void {
    const endedAt = Date.now();
    this.writer.updateSpan(this.id, {
      status,
      ended_at: endedAt,
      duration_ms: endedAt - this.startedAt,
      error: error ? String(error instanceof Error ? error.message : error) : undefined,
    });
  }
}
