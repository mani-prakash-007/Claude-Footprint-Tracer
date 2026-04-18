import { AsyncLocalStorage } from 'node:async_hooks';
import { EventWriter } from '../../storage/writer.js';
import { generateId } from '../../util/id.js';
import { Span } from './span.js';
import type { SpanKind } from '../../types/events.js';

export class TraceContext {
  private static storage = new AsyncLocalStorage<TraceContext>();

  readonly sessionId: string;
  private currentSpanId: string | null = null;
  private writer: EventWriter;

  constructor(writer: EventWriter, sessionId?: string) {
    this.writer = writer;
    this.sessionId = sessionId ?? generateId();
  }

  static current(): TraceContext | undefined {
    return TraceContext.storage.getStore();
  }

  startSpan(name: string, kind: SpanKind): Span {
    const span = new Span(this.writer, this.sessionId, name, kind, this.currentSpanId);
    this.currentSpanId = span.id;
    return span;
  }

  run<T>(fn: () => T): T {
    return TraceContext.storage.run(this, fn);
  }

  getWriter(): EventWriter {
    return this.writer;
  }
}
