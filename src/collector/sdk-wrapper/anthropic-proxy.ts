import type { TraceContext } from './context.js';

/**
 * Creates a Proxy around the Anthropic SDK client that auto-traces
 * all messages.create() and messages.stream() calls.
 */
export function createAnthropicProxy<T extends object>(client: T, ctx: TraceContext): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'messages' && value && typeof value === 'object') {
        return createMessagesProxy(value, ctx);
      }

      return value;
    },
  });
}

function createMessagesProxy(messages: any, ctx: TraceContext): any {
  return new Proxy(messages, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'create' && typeof value === 'function') {
        return async function tracedCreate(params: any) {
          const span = ctx.startSpan(`llm:${params.model ?? 'unknown'}`, 'llm_call');
          span.setInput({
            model: params.model,
            max_tokens: params.max_tokens,
            message_count: params.messages?.length,
            tools: params.tools?.map((t: any) => t.name),
            has_system: !!params.system,
          });

          try {
            const response = await value.call(target, params);

            span.setModel(response.model ?? params.model);
            span.setOutput({
              stop_reason: response.stop_reason,
              content_types: response.content?.map((c: any) => c.type),
            });
            span.setTokens(
              response.usage?.input_tokens ?? 0,
              response.usage?.output_tokens ?? 0,
              response.usage?.cache_read_input_tokens ?? 0,
              response.usage?.cache_creation_input_tokens ?? 0
            );
            span.end('ok');
            return response;
          } catch (err) {
            span.end('error', err);
            throw err;
          }
        };
      }

      if (prop === 'stream' && typeof value === 'function') {
        return function tracedStream(params: any) {
          const span = ctx.startSpan(`llm:${params.model ?? 'unknown'}`, 'llm_call');
          span.setInput({
            model: params.model,
            max_tokens: params.max_tokens,
            message_count: params.messages?.length,
            stream: true,
          });

          const stream = value.call(target, params);

          // Wrap the stream to capture final message
          const originalOn = stream.on?.bind(stream);
          if (originalOn) {
            stream.on = function (event: string, handler: Function) {
              if (event === 'finalMessage' || event === 'message') {
                return originalOn(event, (msg: any) => {
                  span.setModel(msg.model ?? params.model);
                  span.setTokens(
                    msg.usage?.input_tokens ?? 0,
                    msg.usage?.output_tokens ?? 0,
                    msg.usage?.cache_read_input_tokens ?? 0,
                    msg.usage?.cache_creation_input_tokens ?? 0
                  );
                  span.end('ok');
                  handler(msg);
                });
              }
              return originalOn(event, handler);
            };
          }

          return stream;
        };
      }

      return value;
    },
  });
}
