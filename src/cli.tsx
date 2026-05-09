#!/usr/bin/env node
import meow from 'meow';

const cli = meow(
  `
  Usage
    $ atrace                       Open TUI (latest session)
    $ atrace setup                 Register Claude Code hooks (alias: install)
    $ atrace uninstall             Remove hooks; --purge wipes traces too
    $ atrace doctor                Diagnose stale state; --fix to repair
    $ atrace sessions              List traced sessions
    $ atrace --session <id>        Open TUI for a specific session
    $ atrace hook                  (internal) hook handler subprocess

  Setup options
    --user                         Target user-scope settings (default)
    --project                      Target project-scope ./.claude/settings.json
    --yes, -y                      Skip confirmation prompts
    --dry-run                      Print planned changes; do not write
    --force                        Re-register even if up to date

  Uninstall options
    --yes, -y                      Skip confirmation prompts
    --purge                        Also delete ~/.agent-trace (DB, logs)

  Doctor options
    --fix                          Auto-repair detected issues

  TUI options
    --session, -s                  Session ID to view
    --db                           Custom database path
    --poll-interval                TUI polling interval in ms (default: 100)

  Examples
    $ npm install -g agent-trace        # postinstall registers hooks
    $ atrace                            # open TUI
    $ atrace doctor                     # check for stale hooks
    $ atrace uninstall --purge          # remove everything
`,
  {
    importMeta: import.meta,
    flags: {
      session: { type: 'string', shortFlag: 's' },
      db: { type: 'string' },
      pollInterval: { type: 'number', default: 100 },
      user: { type: 'boolean', default: false },
      project: { type: 'boolean', default: false },
      yes: { type: 'boolean', shortFlag: 'y', default: false },
      dryRun: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      purge: { type: 'boolean', default: false },
      fix: { type: 'boolean', default: false },
    },
  },
);

async function main() {
  const [command] = cli.input;

  if (cli.flags.db) {
    process.env.AGENT_TRACE_DB = cli.flags.db;
  }

  const scope: 'user' | 'project' = cli.flags.project ? 'project' : 'user';

  switch (command) {
    case 'setup':
    case 'install': {
      const { setup } = await import('./lifecycle/setup.js');
      const result = await setup({
        scope,
        yes: cli.flags.yes,
        dryRun: cli.flags.dryRun,
        force: cli.flags.force,
      });
      printSetupResult(result);
      break;
    }

    case 'uninstall': {
      const { uninstall } = await import('./lifecycle/uninstall.js');
      const result = await uninstall({
        scope,
        yes: cli.flags.yes,
        purge: cli.flags.purge,
      });
      printUninstallResult(result);
      break;
    }

    case 'doctor': {
      const { doctor } = await import('./lifecycle/doctor.js');
      const report = await doctor({ fix: cli.flags.fix });
      printDoctorReport(report);
      if (report.errorCount > 0 && !cli.flags.fix) process.exitCode = 1;
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
          console.log(
            `  ${s.session_id.slice(0, 8)}  ${date}  ${s.span_count} events  $${s.total_cost_usd.toFixed(4)}`,
          );
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
      const React = await import('react');
      const { render } = await import('ink');
      const { App } = await import('./tui/App.js');
      render(
        React.createElement(App, {
          sessionId: cli.flags.session,
          pollInterval: cli.flags.pollInterval,
        }),
      );
      break;
    }
  }
}

type SetupResult = Awaited<ReturnType<typeof import('./lifecycle/setup.js').setup>>;
type UninstallResult = Awaited<ReturnType<typeof import('./lifecycle/uninstall.js').uninstall>>;
type DoctorReport = Awaited<ReturnType<typeof import('./lifecycle/doctor.js').doctor>>;

function printSetupResult(r: SetupResult): void {
  switch (r.status) {
    case 'installed':
      console.log(`atrace installed (${r.scope}). ${r.message ?? ''}`);
      if (r.backupPath) console.log(`Backup: ${r.backupPath}`);
      break;
    case 'unchanged':
      console.log(r.message ?? 'No changes.');
      break;
    case 'aborted':
      console.log(`Aborted: ${r.message ?? ''}`);
      process.exitCode = 1;
      break;
    case 'dry-run':
      console.log('(dry-run; nothing written)');
      break;
  }
}

function printUninstallResult(r: UninstallResult): void {
  if (r.status === 'noop') {
    console.log('Nothing to remove.');
    return;
  }
  console.log(`Removed ${r.removedHookEntries} hook entries.`);
  for (const f of r.cleanedFiles) console.log(`  cleaned: ${f}`);
  for (const f of r.preservedFiles) console.log(`  preserved: ${f}`);
}

function printDoctorReport(r: DoctorReport): void {
  for (const c of r.checks) {
    const sigil = c.level === 'ok' ? 'OK' : c.level === 'warn' ? 'WARN' : 'ERR';
    console.log(`[${sigil}] ${c.message}`);
  }
  console.log(`\nSummary: ${r.okCount} ok, ${r.warnCount} warn, ${r.errorCount} error`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
