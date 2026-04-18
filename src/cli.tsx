#!/usr/bin/env node
import meow from 'meow';

const cli = meow(`
  Usage
    $ atrace                     Open TUI (latest session)
    $ atrace --session <id>      Open TUI for specific session
    $ atrace install [--user]    Install Claude Code hooks
    $ atrace uninstall           Remove Claude Code hooks
    $ atrace sessions            List all traced sessions
    $ atrace hook                (internal) Hook handler for Claude Code

  Options
    --session, -s    Session ID to view
    --db             Custom database path
    --poll-interval  Polling interval in ms (default: 100)
    --user           Install hooks in user settings (vs project)

  Examples
    $ atrace                     Start TUI, auto-detect latest session
    $ atrace install             Set up Claude Code hooks
    $ atrace -s abc123           View specific session
`, {
  importMeta: import.meta,
  flags: {
    session: { type: 'string', shortFlag: 's' },
    db: { type: 'string' },
    pollInterval: { type: 'number', default: 100 },
    user: { type: 'boolean', default: false },
  },
});

async function main() {
  const [command] = cli.input;

  if (cli.flags.db) {
    process.env.AGENT_TRACE_DB = cli.flags.db;
  }

  switch (command) {
    case 'install': {
      const { install } = await import('./collector/claude-code/install.js');
      install({ scope: cli.flags.user ? 'user' : 'project' });
      break;
    }

    case 'uninstall': {
      const { uninstall } = await import('./collector/claude-code/install.js');
      uninstall({ scope: cli.flags.user ? 'user' : 'project' });
      break;
    }

    case 'sessions': {
      const { createDatabase } = await import('./storage/database.js');
      const { EventReader } = await import('./storage/reader.js');
      const db = createDatabase();
      const reader = new EventReader(db);
      const sessions = reader.listSessions();
      if (sessions.length === 0) {
        console.log('No sessions recorded.');
      } else {
        console.log('Sessions:');
        for (const s of sessions) {
          const date = new Date(s.started_at).toLocaleString();
          console.log(`  ${s.session_id.slice(0, 8)}  ${date}  ${s.span_count} events  $${s.total_cost_usd.toFixed(4)}`);
        }
      }
      db.close();
      break;
    }

    case 'hook': {
      await import('./collector/claude-code/hook-handler.js');
      break;
    }

    default: {
      // Open TUI
      const React = await import('react');
      const { render } = await import('ink');
      const { App } = await import('./tui/App.js');

      render(
        React.createElement(App, {
          sessionId: cli.flags.session,
          pollInterval: cli.flags.pollInterval,
        })
      );
      break;
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
