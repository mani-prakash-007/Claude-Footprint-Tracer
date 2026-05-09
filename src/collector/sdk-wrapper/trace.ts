import { createDatabase } from '../../storage/database.js';
import { EventWriter } from '../../storage/writer.js';
import { TraceContext } from './context.js';
import { createAnthropicProxy } from './anthropic-proxy.js';
import { Span } from './span.js';
import { generateId } from '../../util/id.js';
import type { SpanStatus } from '../../types/events.js';

/**
 * Wrap an Anthropic SDK client to auto-trace all API calls.
 *
 * Usage:
 *   import { trace } from 'claude-atrace';
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const client = trace(new Anthropic());
 */
export function trace<T extends object>(client: T): T {
  const db = createDatabase();
  const writer = new EventWriter(db);
  const sessionId = generateId();
  const ctx = new TraceContext(writer, sessionId);

  writer.createSession({
    session_id: sessionId,
    source: 'sdk_wrapper',
    started_at: Date.now(),
  });

  return ctx.run(() => createAnthropicProxy(client, ctx));
}

/**
 * Create a manual instrumentation span.
 *
 * Usage:
 *   await trace.step('process_results', async (span) => {
 *     span.input({ query: 'find TODOs' });
 *     const results = await process();
 *     span.output({ count: results.length });
 *     return results;
 *   });
 */
trace.step = async function step<T>(
  name: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const ctx = TraceContext.current();
  if (!ctx) {
    // No active context — run without tracing
    return fn(createNoopSpan());
  }

  const span = ctx.startSpan(name, 'custom_step');
  try {
    const result = await fn(span);
    span.end('ok');
    return result;
  } catch (err) {
    span.end('error', err);
    throw err;
  }
};

function createNoopSpan(): Span {
  // Return a minimal span that does nothing (for when trace context isn't active)
  return {
    id: 'noop',
    input: () => {},
    output: () => {},
    setInput: () => {},
    setOutput: () => {},
    setTokens: () => {},
    setModel: () => {},
    end: () => {},
  } as unknown as Span;
}
