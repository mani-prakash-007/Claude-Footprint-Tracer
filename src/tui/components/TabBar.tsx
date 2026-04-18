import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface TabBarProps {
  tabs: string[];
  activeTab: number;
}

export function TabBar({ tabs, activeTab }: TabBarProps) {
  return (
    <Box borderStyle="single" borderBottom={false} paddingX={1}>
      {tabs.map((tab, i) => (
        <Box key={tab} marginRight={2}>
          <Text
            color={i === activeTab ? colors.primary : colors.muted}
            bold={i === activeTab}
          >
            [{i + 1}] {tab}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
