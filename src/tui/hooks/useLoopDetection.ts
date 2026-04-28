import { useMemo } from 'react';
import type { SpanEvent } from '../../types/events.js';

export interface LoopWarning {
  tool: string;
  key: string;
  count: number;
  severity: 'warning' | 'critical';
  reason: string;
}

/**
 * Smart loop detection — flags genuinely wasteful patterns, not normal dev activity.
 *
 * What IS a loop (wasteful):
 *   - Same file Read 4+ times without an Edit (reading without acting = confused)
 *   - Same Grep pattern 3+ times (searching for same thing repeatedly)
 *   - Same exact Bash command 3+ times (retrying failed command)
 *   - Same Bash error 2+ times (repeating broken command)
 *
 * What is NOT a loop (normal):
 *   - Multiple Edits to same file (iterative development)
 *   - cd to project dir (working directory prefix)
 *   - Read then Edit same file (read-before-edit pattern)
 */
export function useLoopDetection(events: SpanEvent[]): LoopWarning[] {
  return useMemo(() => {
    const warnings: LoopWarning[] = [];

    // Track reads without edits
    const readCounts = new Map<string, number>();
    const editedFiles = new Set<string>();

    // Track exact bash commands
    const bashCounts = new Map<string, number>();
    const bashErrors = new Map<string, number>();

    // Track grep patterns
    const grepCounts = new Map<string, number>();

    for (const event of events) {
      if (event.kind !== 'tool_use' && event.kind !== 'custom_step') continue;
      if (event.status === 'pending') continue;

      const input = event.input as Record<string, unknown> | null;
      if (!input) continue;

      switch (event.name) {
        case 'Read': {
          const file = shortPath(input.file_path as string);
          if (file && !editedFiles.has(file)) {
            readCounts.set(file, (readCounts.get(file) ?? 0) + 1);
          }
          break;
        }
        case 'Edit':
        case 'Write': {
          const file = shortPath(input.file_path as string);
          if (file) editedFiles.add(file);
          break;
        }
        case 'Grep': {
          const pattern = input.pattern as string;
          if (pattern) grepCounts.set(pattern, (grepCounts.get(pattern) ?? 0) + 1);
          break;
        }
        case 'Bash': {
          const cmd = normalizeBashCmd(input.command as string);
          if (cmd) {
            bashCounts.set(cmd, (bashCounts.get(cmd) ?? 0) + 1);
            if (event.status === 'error') {
              bashErrors.set(cmd, (bashErrors.get(cmd) ?? 0) + 1);
            }
          }
          break;
        }
      }
    }

    // Flag reads without edits (4+ = confused agent)
    for (const [file, count] of readCounts) {
      if (count >= 4) {
        warnings.push({
          tool: 'Read',
          key: file,
          count,
          severity: count >= 6 ? 'critical' : 'warning',
          reason: `Read ${count}x without editing`,
        });
      }
    }

    // Flag repeated bash commands (3+ = stuck)
    for (const [cmd, count] of bashCounts) {
      if (count >= 3) {
        warnings.push({
          tool: 'Bash',
          key: cmd,
          count,
          severity: count >= 5 ? 'critical' : 'warning',
          reason: `Same command ${count}x`,
        });
      }
    }

    // Flag bash errors retried (2+ = insanity)
    for (const [cmd, count] of bashErrors) {
      if (count >= 2) {
        warnings.push({
          tool: 'Bash',
          key: cmd,
          count,
          severity: 'critical',
          reason: `Failed ${count}x (same error)`,
        });
      }
    }

    // Flag repeated greps (3+ = can't find what looking for)
    for (const [pattern, count] of grepCounts) {
      if (count >= 3) {
        warnings.push({
          tool: 'Grep',
          key: `"${pattern}"`,
          count,
          severity: 'warning',
          reason: `Searched ${count}x`,
        });
      }
    }

    return warnings.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.count - a.count;
    });
  }, [events]);
}

/** Strip common cd prefix and extract actual command */
function normalizeBashCmd(cmd: string | undefined): string | null {
  if (!cmd) return null;
  // Strip: cd "path" && or cd 'path' &&
  let normalized = cmd.replace(/^cd\s+["'][^"']+["']\s*&&\s*/, '');
  // Strip: cd path &&
  normalized = normalized.replace(/^cd\s+\S+\s*&&\s*/, '');
  // Take first 60 chars of the actual command
  normalized = normalized.trim().slice(0, 60);
  return normalized || null;
}

/** Get short filename from full path (last 2 segments) */
function shortPath(fullPath: string | undefined): string | null {
  if (!fullPath) return null;
  const parts = fullPath.split('/');
  return parts.slice(-2).join('/');
}
