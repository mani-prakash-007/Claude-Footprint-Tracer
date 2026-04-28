# agent-trace Design System

Single source of truth for color, symbol, and component conventions across the TUI.

---

## Palette

Defined in `src/tui/theme.ts`. Two layers:

- `colors` — span-kind + status semantic roles (`primary`, `secondary`, `warning`, `error`, `muted`, `text`, `border`, `user_message`, `llm_call`, `tool_use`, `custom_step`, `pending`, `ok`, `error_status`).
- Helper exports — `SPARKLINE_TICKS` (9-step ramp), `GAUGE_SEGMENTS` (htop-style cells), `symbols` (status glyphs, tree connectors, brush, compaction marker).

### Semantic meaning

| Color | Meaning |
|-------|---------|
| `primary` (blue) | Active focus / active tab / breadcrumb |
| `secondary` (green) | Healthy state, cache hit, low cost |
| `warning` (amber) | Mid-cost ($0.50–$5), mid-context (50–80%), mid-cache (40–70%), redundancy ≥ 0.3 |
| `error` (red) | High-cost (>$5), context > 80%, cache < 40%, redundancy ≥ 0.6, errored span |
| `muted` | Dim metadata, timestamps, separators |
| `text` | Default body text |

### Threshold rules

Set once in `colors`/`InsightsBanner`/`StatusBar`:

- Cost: `< 0.5 = secondary`, `0.5–1 = warning`, `> 1 = error`.
- Context %: `< 50 = secondary`, `50–80 = warning`, `> 80 = error bold`.
- Cache hit: `< 40% = warning`, `>= 40% = secondary`.
- Redundancy: `>= 0.6 = error`, `>= 0.3 = warning`, else `secondary`.

---

## Symbols

| Symbol | Use |
|--------|-----|
| `▌` | Selected-row gutter (left edge) |
| `●` | Pill dot — status (color carries semantic meaning) |
| `◌` | Pending ring |
| `◐` | Running spinner placeholder |
| `▼` | Compaction marker on Context timeline |
| `▲ / ▼ / =` | Diff direction (Trends compare) |
| `└ / ├ / ─ / │` | Tree connectors (AgentTreeView) |
| `█ ▇ ▆ ▅ ▄ ▃ ▂ ▁` | Sparkline ramp |
| `█ ▓ ▒ ░ ` ` | Gauge segments (full → empty) |
| `★` | Bookmark (reserved) |
| `↻` | Loop warning |

---

## Components

### `<Pill kind=ok|warn|err|info|pending|running label?>`

Single source of truth for status indicators. Every row that conveys "did this succeed?" must use Pill — never inline ✓ / ✗ icons.

```tsx
<Pill kind="ok" label="142ms" />
<Pill kind="err" />
```

### `<Gauge value max width=10 color?>`

htop-style segmented bar. Uses `█ ▓ ▒ ░ ` glyphs proportional to `value/max`.

```tsx
<Gauge value={cache.hit_rate} max={1} width={20} color={colors.secondary} />
```

### `<Sparkline values width=40 color? ceiling?>`

Single-pass O(width + values) renderer with bucket fill. Supply `ceiling` to scale against an absolute limit (e.g. `CONTEXT_LIMIT`).

```tsx
<Sparkline values={cost_per_turn} width={60} ceiling={maxCost} color={colors.warning} />
```

### `<InsightsBanner insights variant>`

Compact 1-2 line strip rendered at the top of every view. Variants: `console | timeline | tokens | agents | context | files | trends`. Built on threshold rules above; emits `⚠` alerts when thresholds exceeded.

### `<HelpOverlay activeTab width height>`

Modal triggered by `?`. Three-column layout: global keys, view-specific keys, mouse.

---

## Layout conventions

- Every view is a `<Box flexDirection="column" paddingX={1}>`.
- Selected rows use a 3-cue highlight: cyan `▌` gutter + bold label + inverse-video on label.
- Tables right-align numerics. Dim secondary metadata. Bold only when "active focus."
- Use `<Box marginBottom={1}>` between logical groups; never `<Text>{'\n'}</Text>`.
- Borders: `borderStyle="single"` for chrome (header/footer), no inner borders inside the same chrome box.

---

## Adding a new metric

1. Compute in `useSessionInsights` (pure `computeSessionInsights`).
2. Pick a `BannerVariant` and add a chip in `InsightsBanner.buildChips`.
3. If it crosses a threshold worth shouting about, add an alert string in `buildAlerts`.
4. Threshold colors come from §Threshold rules above — do not invent new cutoffs.

---

## Anti-patterns

- ❌ `'─'.repeat(N)` between rows of a `<Box>` that already has a `borderStyle`.
- ❌ Bold + colored + dim on the same `<Text>` — pick at most two.
- ❌ Hardcoded hex colors inside views. Always import from `theme.ts`.
- ❌ Per-row inline status icon. Use `<Pill>`.
- ❌ Adding a new sparkline ramp constant. Import `SPARKLINE_TICKS`.
