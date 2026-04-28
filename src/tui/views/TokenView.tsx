import React from 'react';
import { Box, Text } from 'ink';
import type { SpanEvent } from '../../types/events.js';
import { TokenTable } from '../components/TokenTable.js';
import { useTokenStats } from '../hooks/useTokenStats.js';
import { useTranscriptTurns } from '../hooks/useTranscriptTurns.js';
import { useCacheStats } from '../hooks/useCacheStats.js';
import { useThinkingStats } from '../hooks/useThinkingStats.js';
import { useToolAttribution } from '../hooks/useToolAttribution.js';
import type { TranscriptSummary } from '../../collector/claude-code/transcript-parser.js';
import { colors } from '../theme.js';
import { formatDuration } from '../../util/time.js';
import { formatCost } from '../../util/cost.js';
import { Gauge } from '../components/Gauge.js';
import { InsightsBanner } from '../components/InsightsBanner.js';
import type { SessionInsights } from '../hooks/useSessionInsights.js';

interface TokenViewProps {
  events: SpanEvent[];
  sessionId: string | null;
  transcriptSummary?: TranscriptSummary | null;
  insights?: SessionInsights;
}

export function TokenView({ events, sessionId, transcriptSummary, insights }: TokenViewProps) {
  const stats = useTokenStats(events);
  const turns = useTranscriptTurns(sessionId);
  const cache = useCacheStats(turns);
  const thinking = useThinkingStats(turns);
  const toolAttr = useToolAttribution(events);

  const duration = events.length > 0
    ? (events[events.length - 1].ended_at ?? Date.now()) - events[0].started_at
    : 0;

  const hasTranscript = transcriptSummary && transcriptSummary.turns > 0;

  if (stats.breakdown.length === 0 && !hasTranscript) {
    return (
      <Box paddingX={1}>
        <Text color={colors.muted}>No LLM calls recorded yet...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {insights && <InsightsBanner insights={insights} variant="tokens" />}
      <Box marginBottom={1}>
        <Text color={colors.primary} bold>Token Usage</Text>
        <Text color={colors.muted}> | Session: </Text>
        <Text color={colors.text}>{sessionId?.slice(0, 8)}</Text>
        <Text color={colors.muted}> | Duration: </Text>
        <Text color={colors.text}>{formatDuration(duration)}</Text>
        <Text color={colors.muted}> | Total: </Text>
        <Text color={colors.warning} bold>{formatCost(hasTranscript ? transcriptSummary!.total_cost_usd : stats.totalCost)}</Text>
      </Box>

      {hasTranscript && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.primary} bold>Session Summary (from transcript)</Text>
          <Text color={colors.border}>{'─'.repeat(70)}</Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Model:'.padEnd(20)}</Text>
            <Text color={colors.llm_call}>{transcriptSummary!.model || 'unknown'}</Text>
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'LLM Turns:'.padEnd(20)}</Text>
            {transcriptSummary!.turns.toLocaleString()}
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Input Tokens:'.padEnd(20)}</Text>
            {transcriptSummary!.total_input_tokens.toLocaleString()}
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Output Tokens:'.padEnd(20)}</Text>
            {transcriptSummary!.total_output_tokens.toLocaleString()}
          </Text>
          <Text>
            <Text color={colors.muted}>{'Cache Read:'.padEnd(20)}</Text>
            <Text color={colors.secondary}>{transcriptSummary!.total_cache_read_tokens.toLocaleString()}</Text>
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Cache Write:'.padEnd(20)}</Text>
            {transcriptSummary!.total_cache_write_tokens.toLocaleString()}
          </Text>
          <Text color={colors.border}>{'─'.repeat(70)}</Text>
          <Text>
            <Text color={colors.muted}>{'TOTAL COST:'.padEnd(20)}</Text>
            <Text color={transcriptSummary!.total_cost_usd > 1 ? colors.error : colors.warning} bold>
              {formatCost(transcriptSummary!.total_cost_usd)}
            </Text>
          </Text>
        </Box>
      )}

      {turns.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.primary} bold>Cache Efficiency</Text>
          <Text color={colors.border}>{'─'.repeat(70)}</Text>
          <Box>
            <Text color={colors.muted}>{'Hit rate (overall):'.padEnd(24)}</Text>
            <Gauge value={cache.hit_rate} max={1} width={20} color={cache.hit_rate < 0.4 ? colors.warning : colors.secondary} />
            <Text color={cache.hit_rate < 0.4 ? colors.warning : colors.secondary} bold>
              {' '}{(cache.hit_rate * 100).toFixed(1)}%
            </Text>
          </Box>
          <Box>
            <Text color={colors.muted}>{'Hit rate (last 10):'.padEnd(24)}</Text>
            <Gauge value={cache.recent_hit_rate} max={1} width={20} color={cache.recent_hit_rate < 0.4 ? colors.warning : colors.secondary} />
            <Text color={cache.recent_hit_rate < 0.4 ? colors.warning : colors.secondary}>
              {' '}{(cache.recent_hit_rate * 100).toFixed(1)}%
            </Text>
          </Box>
          {cache.breakage_alert && (
            <Text color={colors.error} bold>
              {'\u26A0'} Cache appears to have broken — recent hit rate dropped &gt;50%.
            </Text>
          )}
        </Box>
      )}

      {turns.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.primary} bold>Thinking Depth</Text>
          <Text color={colors.border}>{'─'.repeat(70)}</Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Total turns:'.padEnd(24)}</Text>
            {thinking.total_turns}
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'With thinking:'.padEnd(24)}</Text>
            {thinking.thinking_turns}
          </Text>
          <Text color={colors.text}>
            <Text color={colors.muted}>{'Avg depth (~chars/4):'.padEnd(24)}</Text>
            {thinking.avg_thinking_tokens.toFixed(0)}
          </Text>
          <Text>
            <Text color={colors.muted}>{'Redaction rate:'.padEnd(24)}</Text>
            <Text color={thinking.redaction_rate > 0.3 ? colors.warning : colors.text}>
              {(thinking.redaction_rate * 100).toFixed(0)}%
            </Text>
          </Text>
          {thinking.depth_collapse_alert && (
            <Text color={colors.error} bold>
              {'\u26A0'} Thinking depth collapsed in recent turns — possible quality regression.
            </Text>
          )}
        </Box>
      )}

      {toolAttr.rows.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.primary} bold>Tool Cost Breakdown <Text color={colors.muted}>(heuristic, ~chars/3.5)</Text></Text>
          <Text color={colors.border}>{'─'.repeat(70)}</Text>
          <Text color={colors.muted}>
            {'Tool'.padEnd(18)}{'Calls'.padStart(7)}{'Input'.padStart(10)}{'Output'.padStart(10)}{'Total'.padStart(10)}{'  Bar'.padEnd(18)}
          </Text>
          {toolAttr.rows.map((r) => {
            const pct = toolAttr.total > 0 ? r.total_tokens / toolAttr.total : 0;
            const barW = Math.max(1, Math.min(12, Math.round(pct * 12)));
            const bar = '█'.repeat(barW) + '░'.repeat(12 - barW);
            const pctStr = ` ${(pct * 100).toFixed(0)}%`;
            return (
              <Text key={r.tool_name} color={colors.text}>
                {r.tool_name.padEnd(18)}
                {String(r.call_count).padStart(7)}
                {r.input_tokens.toLocaleString().padStart(10)}
                {r.output_tokens.toLocaleString().padStart(10)}
                <Text color={colors.warning}>{r.total_tokens.toLocaleString().padStart(10)}</Text>
                {'  '}
                <Text color={pct > 0.33 ? colors.error : pct > 0.15 ? colors.warning : colors.secondary}>{bar}</Text>
                <Text color={colors.muted}>{pctStr}</Text>
              </Text>
            );
          })}
        </Box>
      )}

      {stats.breakdown.length > 0 && (
        <TokenTable
          breakdown={stats.breakdown}
          totalInputTokens={stats.totalInputTokens}
          totalOutputTokens={stats.totalOutputTokens}
          totalCost={stats.totalCost}
        />
      )}
    </Box>
  );
}
