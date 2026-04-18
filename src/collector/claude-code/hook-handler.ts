import { createDatabase } from '../../storage/database.js';
import { EventWriter } from '../../storage/writer.js';
import { mapHookToSpan } from './event-mapper.js';
import type { HookInput } from '../../types/hook-io.js';
import { debug } from '../../util/logger.js';

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw.trim()) {
    process.stdout.write('{}');
    return;
  }

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    debug('Failed to parse hook stdin', raw.slice(0, 200));
    process.stdout.write('{}');
    return;
  }

  debug('Hook received', input.hook_event_name, input.tool_name, JSON.stringify(input).slice(0, 500));

  const db = createDatabase();
  const writer = new EventWriter(db);

  try {
    const result = mapHookToSpan(input);

    switch (result.type) {
      case 'create_session':
        writer.createSession(result.session);
        break;

      case 'insert_span':
        // Auto-create session if it doesn't exist (Claude Code doesn't fire SessionStart)
        writer.createSession({
          session_id: result.span.session_id,
          source: 'claude_code_hook',
          started_at: result.span.started_at,
          cwd: (result.span.metadata as Record<string, unknown>)?.cwd as string | undefined,
        });
        // Link to active Agent span as parent (sub-agent nesting)
        if (result.span.name !== 'Agent') {
          const agentParent = writer.findActiveAgent(result.span.session_id);
          if (agentParent) {
            result.span.parent_id = agentParent;
          }
        }
        writer.insertSpan(result.span);
        break;

      case 'update_span': {
        // Ensure session exists
        writer.createSession({
          session_id: result.sessionId,
          source: 'claude_code_hook',
          started_at: Date.now(),
          cwd: input.cwd,
        });
        const spanId = writer.findPendingSpan(result.sessionId, result.toolName);
        if (spanId) {
          const endedAt = result.updates.ended_at ?? Date.now();
          writer.updateSpan(spanId, {
            ...result.updates,
            ended_at: endedAt,
          });
        } else {
          debug('No pending span found for', result.toolName, result.sessionId);
        }
        break;
      }

      case 'end_session':
        writer.endSession(result.session_id, result.ended_at);
        break;

      case 'noop':
        break;
    }
  } finally {
    db.close();
  }

  process.stdout.write('{}');
}

main().catch((err) => {
  process.stderr.write(`agent-trace hook error: ${err.message}\n`);
  process.stdout.write('{}');
  process.exit(0); // Exit 0 so Claude Code doesn't block
});
