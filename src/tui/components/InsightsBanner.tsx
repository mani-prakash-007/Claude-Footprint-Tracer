import React from 'react';
import { Box, Text } from 'ink';
import type { SessionInsights } from '../hooks/useSessionInsights.js';
import { colors } from '../theme.js';
import { formatCost } from '../../util/cost.js';

export type BannerVariant =
  | 'console'
  | 'timeline'
  | 'tokens'
  | 'agents'
  | 'context'
  | 'files'
  | 'trends';

interface InsightsBannerProps {
  insights: SessionInsights;
  variant: BannerVariant;
}

interface Chip {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}

function buildChips(ins: SessionInsights, variant: BannerVariant): Chip[] {
  switch (variant) {
    case 'console':
      return [
        { label: 'tools', value: `${ins.total_tool_calls}`, color: colors.text },
        {
          label: 'errors',
          value: `${ins.error_tool_calls} (${(ins.error_rate * 100).toFixed(0)}%)`,
          color: ins.error_rate > 0.1 ? colors.error : colors.text,
          bold: ins.error_rate > 0.1,
        },
        {
          label: 'pending',
          value: `${ins.pending_count}`,
          color: ins.pending_count > 0 ? colors.warning : colors.text,
        },
        {
          label: 'top tool',
          value: ins.most_called_tool ?? '—',
          color: colors.secondary,
        },
        {
          label: 'redundant files',
          value: `${ins.redundant_files}`,
          color: ins.redundant_files > 0 ? colors.warning : colors.text,
        },
      ];

    case 'tokens':
      return [
        {
          label: 'cost',
          value: formatCost(ins.total_cost_usd),
          color: ins.total_cost_usd > 5 ? colors.error : colors.warning,
          bold: true,
        },
        {
          label: 'burn',
          value: `${formatCost(ins.burn_rate_per_min)}/min`,
          color: ins.burn_rate_per_min > 0.05 ? colors.warning : colors.text,
        },
        {
          label: 'proj 60m',
          value: formatCost(ins.projected_60min_cost),
          color: ins.projected_60min_cost > 5 ? colors.error : colors.text,
        },
        {
          label: 'cache hit',
          value: `${(ins.cache_hit_rate * 100).toFixed(0)}%`,
          color:
            ins.cache_hit_rate < 0.4 ? colors.warning : colors.secondary,
        },
        {
          label: 'cache saved',
          value: `~${formatCost(ins.cache_savings_usd)}`,
          color: colors.secondary,
        },
        {
          label: 'wasted reads',
          value: `~${formatCost(ins.wasted_read_usd)}`,
          color: ins.wasted_read_usd > 0.05 ? colors.warning : colors.text,
        },
      ];

    case 'timeline':
      return [
        { label: 'spans', value: `${ins.total_tool_calls}`, color: colors.text },
        {
          label: 'errors',
          value: `${ins.error_tool_calls}`,
          color: ins.error_tool_calls > 0 ? colors.error : colors.text,
        },
        {
          label: 'duration',
          value: formatDuration(ins.duration_ms),
          color: colors.text,
        },
        {
          label: 'top tool',
          value: ins.most_called_tool ?? '—',
          color: colors.secondary,
        },
      ];

    case 'agents':
      return [
        { label: 'agents', value: `${ins.agent_count}`, color: colors.text },
        {
          label: 'delegated cost',
          value: formatCost(ins.delegated_cost_usd),
          color: colors.warning,
        },
        {
          label: '% delegated',
          value: `${(ins.delegated_share * 100).toFixed(0)}%`,
          color:
            ins.delegated_share > 0.7
              ? colors.warning
              : colors.secondary,
        },
      ];

    case 'context':
      return [
        {
          label: 'context',
          value: `${ins.context_current.toLocaleString()} / ${ins.context_limit.toLocaleString()}`,
          color:
            ins.context_pct >= 75 ? colors.error : ins.context_pct > 50 ? colors.warning : colors.secondary,
          bold: ins.context_pct >= 75,
        },
        {
          label: '%',
          value: `${ins.context_pct.toFixed(1)}%`,
          color:
            ins.context_pct >= 75 ? colors.error : ins.context_pct > 50 ? colors.warning : colors.secondary,
        },
        {
          label: 'peak',
          value: `${ins.context_peak.toLocaleString()}`,
          color: colors.text,
        },
        {
          label: 'compactions',
          value: `${ins.compaction_count}`,
          color: ins.compaction_count > 3 ? colors.warning : colors.text,
        },
      ];

    case 'files':
      return [
        {
          label: 'R:E ratio',
          value: ins.read_edit_ratio.toFixed(2),
          color:
            ins.read_edit_ratio > 6 ? colors.error : ins.read_edit_ratio > 3 ? colors.warning : colors.secondary,
        },
        {
          label: 'redundant',
          value: `${ins.redundant_files}`,
          color: ins.redundant_files > 0 ? colors.warning : colors.text,
        },
        {
          label: 'wasted ~',
          value: formatCost(ins.wasted_read_usd),
          color: ins.wasted_read_usd > 0.05 ? colors.warning : colors.text,
        },
      ];

    case 'trends':
      return [
        {
          label: 'session cost',
          value: formatCost(ins.total_cost_usd),
          color: colors.warning,
        },
        {
          label: 'burn',
          value: `${formatCost(ins.burn_rate_per_min)}/min`,
          color: colors.text,
        },
        {
          label: 'cache hit',
          value: `${(ins.cache_hit_rate * 100).toFixed(0)}%`,
          color:
            ins.cache_hit_rate < 0.4 ? colors.warning : colors.secondary,
        },
      ];

    default:
      return [];
  }
}

function buildAlerts(ins: SessionInsights, variant: BannerVariant): string[] {
  const alerts: string[] = [];
  if ((variant === 'tokens' || variant === 'console') && ins.cache_breakage_alert) {
    alerts.push('Cache hit rate dropped >50% in last 10 turns — possible cache breakage');
  }
  if ((variant === 'context' || variant === 'console') && ins.context_pct >= 75) {
    const pct = Math.min(100, Math.round(ins.context_pct));
    const note = ins.context_pct > 100 ? ' (over reported limit — model may be on extended-context plan)' : '';
    alerts.push(`Context ${pct}% full — auto-compact imminent${note}`);
  }
  if ((variant === 'tokens') && ins.projected_60min_cost > 10) {
    alerts.push(`At current burn rate, next 60min would cost ~${formatCost(ins.projected_60min_cost)}`);
  }
  if ((variant === 'console' || variant === 'files') && ins.redundant_files >= 3) {
    alerts.push(`${ins.redundant_files} files read ≥3× without edits — wasted budget`);
  }
  if ((variant === 'tokens' || variant === 'agents') && ins.delegated_share > 0.7) {
    alerts.push(`${(ins.delegated_share * 100).toFixed(0)}% of cost ran inside sub-agents`);
  }
  if ((variant === 'console') && ins.error_rate > 0.15) {
    alerts.push(`Error rate ${(ins.error_rate * 100).toFixed(0)}% — check Bash retries`);
  }
  return alerts;
}

export function InsightsBanner({ insights, variant }: InsightsBannerProps) {
  const chips = buildChips(insights, variant);
  const alerts = buildAlerts(insights, variant);

  if (chips.length === 0 && alerts.length === 0) return null;

  // Render chips as one Box per chip — each forced onto a row by the parent
  // column layout. Wrap chips into multiple lines when the chip count is high
  // so a wide banner can't bleed into adjacent rows.
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexWrap="wrap">
        {chips.map((chip, i) => (
          <Box key={chip.label} marginRight={2}>
            {i > 0 ? null : null}
            <Text color={colors.muted}>{chip.label}: </Text>
            <Text color={chip.color} bold={chip.bold}>{chip.value}</Text>
          </Box>
        ))}
      </Box>
      {alerts.map((alert) => (
        <Box key={alert}>
          <Text color={colors.error} bold>{'\u26A0  '}{alert}</Text>
        </Box>
      ))}
    </Box>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}
