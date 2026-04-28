export const colors = {
  primary: '#61afef',
  secondary: '#98c379',
  warning: '#e5c07b',
  error: '#e06c75',
  muted: '#5c6370',
  text: '#abb2bf',
  bg: '#282c34',
  border: '#3e4451',

  // Span kind colors
  user_message: '#c678dd',
  llm_call: '#61afef',
  tool_use: '#98c379',
  custom_step: '#e5c07b',
  session: '#5c6370',

  // Status colors
  pending: '#e5c07b',
  ok: '#98c379',
  error_status: '#e06c75',
};

export const symbols = {
  arrow_right: '\u2192',
  arrow_left: '\u2190',
  check: '\u2713',
  cross: '\u2717',
  dot: '\u2022',
  block_full: '\u2588',
  block_light: '\u2591',
  block_medium: '\u2592',
  pill_dot: '\u25CF',
  pending_ring: '\u25CC',
  running: '\u25D0',
  compaction: '\u25BC',
  spinner: ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'],
};

// 9-step sparkline ramp (lowest → highest). Shared by Sparkline component.
export const SPARKLINE_TICKS = ['_', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'] as const;

// Gauge segments for percentage bars (htop-style).
export const GAUGE_SEGMENTS = {
  full: '\u2588',
  three: '\u2593',
  half: '\u2592',
  light: '\u2591',
  empty: ' ',
} as const;
