#!/usr/bin/env node
// agent-trace npm postinstall — auto-registers Claude Code hooks on `npm i -g`.
// Must NEVER throw; postinstall failure must not break `npm install`.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  if (process.env.AGENT_TRACE_SKIP_POSTINSTALL === '1') {
    log('postinstall skipped via AGENT_TRACE_SKIP_POSTINSTALL=1');
    return;
  }

  // Only run for global installs. Local installs (consumers using the lib)
  // should not auto-modify Claude config.
  if (process.env.npm_config_global !== 'true') {
    return;
  }

  if (process.env.AGENT_TRACE_DISABLE_POSTINSTALL === '1') return;

  // Sudo footgun: warn loudly when running as root with SUDO_USER set; the
  // setup() function targets the real user's home automatically via paths.ts,
  // but the user should know.
  if (
    process.platform !== 'win32' &&
    typeof process.getuid === 'function' &&
    process.getuid() === 0
  ) {
    if (process.env.SUDO_USER) {
      log(`running under sudo; targeting ${process.env.SUDO_USER}'s home for hook config.`);
    } else {
      log('running as root with no SUDO_USER. Hooks will land in root\'s ~/.claude.');
    }
  }

  const distSetup = path.resolve(__dirname, '..', 'dist', 'lifecycle', 'setup.js');
  let setup;
  try {
    ({ setup } = await import(pathToFileURL(distSetup).href));
  } catch (err) {
    log(`could not load lifecycle setup module (${err.message}). Run \`atrace setup\` manually.`);
    return;
  }

  const handlerSrc = path.resolve(__dirname, '..', 'dist', 'standalone-handler.cjs');
  const pkgRoot = path.resolve(__dirname, '..');
  const pkgVersion = readPkgVersion(pkgRoot);

  // No TTY (CI / npm output) → run in non-interactive mode.
  const yes = !process.stdout.isTTY;

  try {
    const result = await setup({
      scope: 'user',
      yes,
      pkgVersion,
      pkgRoot,
      handlerSource: handlerSrc,
    });
    if (result.status === 'installed') {
      log(`hooks registered: ${result.settingsPath}`);
    } else if (result.status === 'unchanged') {
      log('hooks already registered.');
    } else if (result.status === 'aborted') {
      log(`setup aborted: ${result.message ?? ''} Run \`atrace setup\` to retry.`);
    }
  } catch (err) {
    log(`setup failed: ${err.message}. Run \`atrace setup\` manually to finish installation.`);
  }
}

function readPkgVersion(pkgRoot) {
  try {
    const data = require(path.join(pkgRoot, 'package.json'));
    return String(data.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function log(msg) {
  process.stdout.write(`[agent-trace] ${msg}\n`);
}

run().catch((err) => {
  log(`postinstall error swallowed: ${err.message}`);
  process.exit(0);
});
