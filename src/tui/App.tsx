import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useEvents } from './hooks/useEvents.js';
import { useLatestSession, useSessions } from './hooks/useSession.js';
import { useTokenStats } from './hooks/useTokenStats.js';
import { TabBar } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { ConsoleView } from './views/ConsoleView.js';
import { TimelineView } from './views/TimelineView.js';
import { TokenView } from './views/TokenView.js';
import { SessionListView } from './views/SessionListView.js';
import { colors } from './theme.js';

const TABS = ['Console', 'Timeline', 'Tokens', 'Sessions'];

interface AppProps {
  sessionId?: string;
  pollInterval?: number;
}

export function App({ sessionId: initialSessionId, pollInterval = 100 }: AppProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId ?? null);

  const latestSession = useLatestSession();
  const sessions = useSessions();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 24;

  // Auto-select latest session if none specified
  useEffect(() => {
    if (!currentSessionId && latestSession) {
      setCurrentSessionId(latestSession.session_id);
    }
  }, [latestSession, currentSessionId]);

  const events = useEvents(currentSessionId, pollInterval);
  const tokenStats = useTokenStats(events);

  // Auto-scroll to bottom in console view
  useEffect(() => {
    if (activeTab === 0 && events.length > 0) {
      setSelectedIndex(events.length - 1);
    }
  }, [events.length, activeTab]);

  useInput((input, key) => {
    // Tab switching
    if (input === '1') setActiveTab(0);
    else if (input === '2') setActiveTab(1);
    else if (input === '3') setActiveTab(2);
    else if (input === '4') setActiveTab(3);
    else if (key.tab) setActiveTab((prev) => (prev + 1) % TABS.length);

    // Scrolling
    else if (input === 'j' || key.downArrow) {
      setSelectedIndex((prev) => Math.min(prev + 1, events.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    }

    // Session selection (in sessions tab)
    else if (key.return && activeTab === 3 && sessions[selectedIndex]) {
      setCurrentSessionId(sessions[selectedIndex].session_id);
      setActiveTab(0);
      setSelectedIndex(0);
    }

    // Quit
    else if (input === 'q') {
      process.exit(0);
    }
  });

  const visibleCount = Math.max(termHeight - 6, 5);

  return (
    <Box flexDirection="column" height={termHeight}>
      <TabBar tabs={TABS} activeTab={activeTab} />

      <Box flexGrow={1} flexDirection="column">
        {activeTab === 0 && (
          <ConsoleView
            events={events}
            selectedIndex={selectedIndex}
            visibleCount={visibleCount}
          />
        )}
        {activeTab === 1 && (
          <TimelineView events={events} width={termWidth} />
        )}
        {activeTab === 2 && (
          <TokenView events={events} sessionId={currentSessionId} />
        )}
        {activeTab === 3 && (
          <SessionListView
            sessions={sessions}
            selectedIndex={selectedIndex}
            onSelect={(id) => {
              setCurrentSessionId(id);
              setActiveTab(0);
            }}
          />
        )}
      </Box>

      <StatusBar
        sessionId={currentSessionId}
        eventCount={events.length}
        startedAt={events[0]?.started_at ?? null}
        totalCost={tokenStats.totalCost}
      />
    </Box>
  );
}
