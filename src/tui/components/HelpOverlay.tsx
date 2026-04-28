import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface KeyBind {
  key: string;
  desc: string;
}

interface HelpSection {
  title: string;
  keys: KeyBind[];
}

const GLOBAL_KEYS: KeyBind[] = [
  { key: '1-7',           desc: 'switch tab' },
  { key: 'Tab / S-Tab',   desc: 'next / prev tab' },
  { key: '\u2190 / \u2192', desc: 'prev / next tab' },
  { key: '\u2191 / \u2193 / j / k', desc: 'scroll' },
  { key: 'PgUp / PgDn',   desc: 'page scroll' },
  { key: 'g / G',         desc: 'top / bottom' },
  { key: 'Home / End',    desc: 'top / bottom' },
  { key: 'Enter',         desc: 'open detail / load session' },
  { key: 'Esc',           desc: 'close drawer / clear filter' },
  { key: '?',             desc: 'this help' },
  { key: 'q',             desc: 'quit (or close drawer)' },
];

const VIEW_KEYS: Record<number, HelpSection> = {
  0: { title: 'Console',  keys: [
    { key: 'Enter',  desc: 'span detail drawer' },
  ]},
  6: { title: 'Trends',   keys: [
    { key: 'Space',  desc: 'mark for compare (max 2)' },
    { key: 'Enter',  desc: 'load this session' },
  ]},
};

const MOUSE_KEYS: KeyBind[] = [
  { key: 'wheel',        desc: 'scroll list' },
  { key: 'click row',    desc: 'select' },
  { key: 'double-click', desc: 'open detail' },
  { key: 'click tab',    desc: 'switch tab' },
];

interface HelpOverlayProps {
  activeTab: number;
  width: number;
  height: number;
}

export function HelpOverlay({ activeTab, width, height }: HelpOverlayProps) {
  const tabSection = VIEW_KEYS[activeTab];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} width={width} height={height}>
      <Box>
        <Text color={colors.primary} bold>Keyboard & mouse reference</Text>
        <Text color={colors.muted}>  (press ? or Esc to close)</Text>
      </Box>
      <Text color={colors.border}>{'\u2500'.repeat(Math.max(0, width - 4))}</Text>

      <Box flexDirection="row" marginTop={1}>
        <KeyColumn title="Global" keys={GLOBAL_KEYS} />
        <Box marginLeft={4} flexDirection="column">
          {tabSection && <KeyColumn title={tabSection.title} keys={tabSection.keys} />}
          <Box marginTop={tabSection ? 1 : 0}>
            <KeyColumn title="Mouse / touchpad" keys={MOUSE_KEYS} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function KeyColumn({ title, keys }: HelpSection) {
  return (
    <Box flexDirection="column">
      <Text color={colors.user_message} bold>{title}</Text>
      <Text color={colors.border}>{'\u2500'.repeat(20)}</Text>
      {keys.map((k) => (
        <Box key={k.key}>
          <Text color={colors.warning}>{k.key.padEnd(18)}</Text>
          <Text color={colors.text}>{k.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}
