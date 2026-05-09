export function jsonDiffSummary(before: unknown, after: unknown): string {
  const beforeStr = JSON.stringify(before, null, 2);
  const afterStr = JSON.stringify(after, null, 2);
  if (beforeStr === afterStr) return '(no changes)';
  return [
    '--- before',
    indent(beforeStr, '  '),
    '+++ after',
    indent(afterStr, '  '),
  ].join('\n');
}

function indent(s: string, prefix: string): string {
  return s
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}
