export function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function summarizeInput(input: Record<string, unknown> | null, maxLen = 60): string {
  if (!input) return '';
  const keys = Object.keys(input);
  if (keys.length === 0) return '{}';

  // Show first key-value pair abbreviated
  const firstKey = keys[0];
  const firstVal = input[firstKey];
  const valStr = typeof firstVal === 'string'
    ? `"${truncateString(firstVal, 30)}"`
    : JSON.stringify(firstVal)?.slice(0, 30) ?? 'null';

  const summary = `{ ${firstKey}: ${valStr}${keys.length > 1 ? ', ...' : ''} }`;
  return truncateString(summary, maxLen);
}
