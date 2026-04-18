export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m${secs}s`;
}

export function formatRelativeTime(epochMs: number, baseMs: number): string {
  const diff = epochMs - baseMs;
  const secs = Math.floor(diff / 1000);
  const ms = diff % 1000;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;

  if (mins > 0) {
    return `${String(mins).padStart(2, '0')}:${String(remainSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
  return `00:${String(remainSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString();
}
