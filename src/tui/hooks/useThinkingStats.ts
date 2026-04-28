import { useMemo } from 'react';
import type { TranscriptTurn } from '../../collector/claude-code/transcript-parser.js';

export interface ThinkingStats {
  total_turns: number;
  thinking_turns: number;
  redacted_turns: number;
  total_thinking_tokens: number;
  avg_thinking_tokens: number;
  redaction_rate: number;
  depth_collapse_alert: boolean;
}

const RECENT_WINDOW = 8;

/**
 * Thinking-depth + redaction tracking.
 *
 * Surfaces the regression signal from issue #42796: thinking depth
 * collapsed 67% before content redaction even began. We track total
 * thinking-token estimate plus a depth-collapse alert when the recent
 * window's avg thinking tokens drops far below the session average.
 */
export function useThinkingStats(turns: TranscriptTurn[]): ThinkingStats {
  return useMemo(() => {
    const assistantTurns = turns.filter((t) => t.type === 'assistant');
    const totalTurns = assistantTurns.length;
    const thinkingTurns = assistantTurns.filter((t) => t.thinking_tokens > 0).length;
    const redactedTurns = assistantTurns.filter((t) => t.thinking_redacted).length;
    const totalTokens = assistantTurns.reduce((s, t) => s + t.thinking_tokens, 0);
    const avg = totalTurns > 0 ? totalTokens / totalTurns : 0;

    const recent = assistantTurns.slice(-RECENT_WINDOW);
    const recentAvg =
      recent.length > 0 ? recent.reduce((s, t) => s + t.thinking_tokens, 0) / recent.length : 0;

    const depth_collapse_alert =
      totalTurns >= RECENT_WINDOW * 2 && avg > 50 && recentAvg < avg * 0.4;

    return {
      total_turns: totalTurns,
      thinking_turns: thinkingTurns,
      redacted_turns: redactedTurns,
      total_thinking_tokens: totalTokens,
      avg_thinking_tokens: avg,
      redaction_rate: totalTurns > 0 ? redactedTurns / totalTurns : 0,
      depth_collapse_alert,
    };
  }, [turns]);
}
