import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import { useEvents } from './hooks/useEvents.js';
import { useLatestSession, useSessions } from './hooks/useSession.js';
import { useTokenStats } from './hooks/useTokenStats.js';
import { useTranscriptCost } from './hooks/useTranscriptCost.js';
import { useTranscriptTurns } from './hooks/useTranscriptTurns.js';
import { useContextTimeline } from './hooks/useContextTimeline.js';
import { useCacheStats } from './hooks/useCacheStats.js';
import { useTokenAttribution } from './hooks/useTokenAttribution.js';
import { useSessionInsights } from './hooks/useSessionInsights.js';
import { useMouse, type MouseEvent } from './hooks/useMouse.js';
import { TabBar } from './components/TabBar.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { ConsoleView } from './views/ConsoleView.js';
import { TimelineView } from './views/TimelineView.js';
import { TokenView } from './views/TokenView.js';
import { AgentTreeView } from './views/AgentTreeView.js';
import { ContextView } from './views/ContextView.js';
import { FileHeatmapView } from './views/FileHeatmapView.js';
import { TrendsView } from './views/TrendsView.js';
import { SpanDetail } from './components/SpanDetail.js';

const TABS = ['Console', 'Timeline', 'Tokens', 'Agents', 'Context', 'Files', 'Trends'] as const;
type TabIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface AppProps {
  sessionId?: string;
  pollInterval?: number;
}

export function App({ sessionId: initialSessionId, pollInterval = 100 }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const [tabSelection, setTabSelection] = useState<Record<TabIndex, number>>({
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0,
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId ?? null);
  const [showDetail, setShowDetail] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());

  const { exit } = useApp();
  const latestSession = useLatestSession();
  const sessions = useSessions();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 24;

  useEffect(() => {
    if (!currentSessionId && latestSession) {
      setCurrentSessionId(latestSession.session_id);
    }
  }, [latestSession, currentSessionId]);

  const events = useEvents(currentSessionId, pollInterval);
  const tokenStats = useTokenStats(events);
  const transcriptCost = useTranscriptCost(currentSessionId);
  const transcriptTurns = useTranscriptTurns(currentSessionId);
  const contextState = useContextTimeline(currentSessionId);
  const cacheStats = useCacheStats(transcriptTurns);
  useTokenAttribution(currentSessionId);
  const insights = useSessionInsights({
    events,
    turns: transcriptTurns,
    summary: transcriptCost ?? null,
  });

  const selectedIndex = tabSelection[activeTab];
  // Console "tail" mode: when user is parked at the latest event, new events
  // pull selection forward. Once they scroll up, tail disengages and the
  // chosen event stays put even as new spans arrive.
  const tailingRef = useRef(true);
  const lastEventCountRef = useRef(0);

  const setSelectedIndex = useCallback((next: number | ((prev: number) => number)) => {
    setTabSelection((prev) => {
      const cur = prev[activeTab];
      const newVal = typeof next === 'function' ? next(cur) : next;
      if (activeTab === 0) {
        // Tailing iff the user moved (or stayed) at the bottom of the list.
        tailingRef.current = newVal >= events.length - 1;
      }
      return { ...prev, [activeTab]: newVal };
    });
  }, [activeTab, events.length]);

  const upperBound = useMemo(() => {
    switch (activeTab) {
      case 0: case 1: case 2: case 3: case 5: return Math.max(0, events.length - 1);
      case 6: return Math.max(0, sessions.length - 1);
      default: return 0;
    }
  }, [activeTab, events.length, sessions.length]);

  // Auto-tail console only when the user has stayed at the bottom.
  // If they scrolled up to inspect a span, leave their selection alone.
  useEffect(() => {
    const prevLen = lastEventCountRef.current;
    if (activeTab === 0 && events.length > prevLen && tailingRef.current) {
      setTabSelection((prev) => ({ ...prev, 0: events.length - 1 }));
    }
    lastEventCountRef.current = events.length;
  }, [events.length, activeTab]);

  // Switching INTO Console: re-engage tailing only if currently parked at end.
  useEffect(() => {
    if (activeTab === 0) {
      tailingRef.current = tabSelection[0] >= events.length - 1;
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input, key) => {
    // Help overlay first — `?` toggles, Esc / q closes.
    if (input === '?') {
      setShowHelp((prev) => !prev);
      return;
    }
    if (showHelp) {
      if (key.escape || input === 'q') setShowHelp(false);
      return;
    }

    // Tab switching: number keys, Tab/S-Tab, ←/→
    if (input >= '1' && input <= '7') {
      const idx = Number(input) - 1;
      if (idx < TABS.length) setActiveTab(idx as TabIndex);
      return;
    }
    if (key.tab && key.shift) {
      setActiveTab((prev) => ((prev - 1 + TABS.length) % TABS.length) as TabIndex);
      return;
    }
    if (key.tab || key.rightArrow) {
      setActiveTab((prev) => ((prev + 1) % TABS.length) as TabIndex);
      return;
    }
    if (key.leftArrow) {
      setActiveTab((prev) => ((prev - 1 + TABS.length) % TABS.length) as TabIndex);
      return;
    }

    // List scrolling
    if (input === 'j' || key.downArrow) {
      setSelectedIndex((prev) => Math.min(prev + 1, upperBound));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (key.pageDown) {
      const page = Math.max(1, Math.floor((termHeight - 6) / 2));
      setSelectedIndex((prev) => Math.min(prev + page, upperBound));
      return;
    }
    if (key.pageUp) {
      const page = Math.max(1, Math.floor((termHeight - 6) / 2));
      setSelectedIndex((prev) => Math.max(prev - page, 0));
      return;
    }
    if (input === 'g' || key.home) {
      setSelectedIndex(0);
      return;
    }
    if (input === 'G' || key.end) {
      // Jump to bottom + re-engage tail explicitly.
      tailingRef.current = true;
      setSelectedIndex(upperBound);
      return;
    }
    if (input === '.' && activeTab === 0) {
      // Toggle tail. When enabled, jump to latest immediately.
      tailingRef.current = !tailingRef.current;
      if (tailingRef.current) setSelectedIndex(Math.max(0, events.length - 1));
      return;
    }

    if (key.return && activeTab === 0 && events[selectedIndex]) {
      setShowDetail((prev) => !prev);
      return;
    }
    if (key.escape) {
      setShowDetail(false);
      return;
    }

    // Trends tab: space marks, enter loads session
    if (activeTab === 6) {
      const session = sessions[selectedIndex];
      if (input === ' ' && session) {
        setCompareSet((prev) => {
          const next = new Set(prev);
          if (next.has(session.session_id)) next.delete(session.session_id);
          else if (next.size < 2) next.add(session.session_id);
          return next;
        });
        return;
      }
      if (key.return && session) {
        setCurrentSessionId(session.session_id);
        setActiveTab(0);
        return;
      }
    }

    if (input === 'q') {
      if (showDetail) setShowDetail(false);
      else exit();
    }
  });

  // Mouse + touchpad: wheel scrolls active list, click on tab strip switches tab.
  const onMouse = useCallback((ev: MouseEvent) => {
    if (showHelp) {
      // any click closes help overlay
      if (ev.action === 'press') setShowHelp(false);
      return;
    }
    if (ev.action === 'wheel') {
      if (ev.button === 'wheel-up') {
        setSelectedIndex((prev) => Math.max(0, prev - 3));
      } else {
        setSelectedIndex((prev) => Math.min(prev + 3, upperBound));
      }
      return;
    }
    if (ev.action === 'press' && ev.button === 'left' && ev.y <= 2) {
      // Tab strip click. TabBar renders `[N] Name` separated by 2-space margins.
      const labels = TABS.map((t, i) => `[${i + 1}] ${t}`);
      let col = 2; // border + paddingX
      for (let i = 0; i < labels.length; i++) {
        const end = col + labels[i].length;
        if (ev.x >= col && ev.x <= end) {
          setActiveTab(i as TabIndex);
          return;
        }
        col = end + 2;
      }
    }
  }, [upperBound, showHelp, setSelectedIndex]);

  useMouse(onMouse);

  const visibleCount = Math.max(termHeight - 6, 5);

  return (
    <Box flexDirection="column" height={termHeight}>
      <TabBar tabs={TABS as unknown as string[]} activeTab={activeTab} />

      <Box flexGrow={1} flexDirection="column">
        {showHelp ? (
          <HelpOverlay activeTab={activeTab} width={termWidth} height={visibleCount} />
        ) : showDetail && events[selectedIndex] ? (
          <SpanDetail event={events[selectedIndex]} height={visibleCount} />
        ) : (
          <>
            {activeTab === 0 && (
              <ConsoleView
                events={events}
                selectedIndex={selectedIndex}
                visibleCount={visibleCount}
                insights={insights}
                width={termWidth - 2}
              />
            )}
            {activeTab === 1 && (
              <TimelineView events={events} width={termWidth} insights={insights} />
            )}
            {activeTab === 2 && (
              <TokenView
                events={events}
                sessionId={currentSessionId}
                transcriptSummary={transcriptCost}
                insights={insights}
              />
            )}
            {activeTab === 3 && (
              <AgentTreeView
                events={events}
                selectedIndex={selectedIndex}
                visibleCount={visibleCount}
                insights={insights}
              />
            )}
            {activeTab === 4 && (
              <ContextView
                sessionId={currentSessionId}
                width={termWidth}
                insights={insights}
              />
            )}
            {activeTab === 5 && (
              <FileHeatmapView
                events={events}
                selectedIndex={selectedIndex}
                visibleCount={visibleCount}
                insights={insights}
              />
            )}
            {activeTab === 6 && (
              <TrendsView
                selectedIndex={selectedIndex}
                selectedForCompare={compareSet}
                insights={insights}
              />
            )}
          </>
        )}
      </Box>

      <StatusBar
        sessionId={currentSessionId}
        eventCount={events.length}
        startedAt={events[0]?.started_at ?? null}
        totalCost={tokenStats.totalCost}
        transcriptCost={transcriptCost?.total_cost_usd}
        model={transcriptCost?.model}
        turns={transcriptCost?.turns}
        contextTokens={contextState.current_tokens || null}
        cacheHitRate={cacheStats.hit_rate || null}
      />
    </Box>
  );
}
