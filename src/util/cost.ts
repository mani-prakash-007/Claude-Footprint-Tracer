interface ModelPricing {
  input: number;   // USD per million tokens
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-haiku-3-5': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
};

export function calculateCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number {
  if (!model) return 0;
  const pricing = findPricing(model);
  if (!pricing) return 0;

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheReadTokens / 1_000_000) * (pricing.cacheRead ?? pricing.input) +
    (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite ?? pricing.input)
  );
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.000';
  if (usd < 0.001) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function findPricing(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Strip date suffix and try again
  const base = model.replace(/-\d{8}$/, '');
  if (MODEL_PRICING[base]) return MODEL_PRICING[base];
  // Prefix match
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  return null;
}
