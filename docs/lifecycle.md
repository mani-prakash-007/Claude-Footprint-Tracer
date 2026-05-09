# atrace Lifecycle: Install / Uninstall / Self-Heal

This is the maintainer reference for atrace's package lifecycle. Read it before changing anything under `src/lifecycle/`, `scripts/`, or the standalone hook handler.

For end-user instructions, see [README.md](../README.md). For the high-level design rationale, see [ADR-014](decisions/ADR-014-self-healing-lifecycle.md).

---

## 1. Goals

1. **One-command install.** `npm install -g claude-atrace` registers Claude Code hooks via npm `postinstall`. Users do not run a second command in the happy path.
2. **Reversible by default.** Every artifact written by setup is removable by uninstall. No orphaned config, no lingering shell modifications.
3. **Survives `npm rm -g`** even when npm skips lifecycle scripts (which is common for global packages). Achieved via stable runtime path + self-healing handler.
4. **Atomic, transactional.** Setup either fully succeeds or rolls back. Backups before any settings.json mutation. Manifest tracks what was written.
5. **Idempotent.** Setup is safe to re-run. Uninstall is safe to call zero, one, or many times.
6. **Cross-platform** at the source level (macOS + Windows targeted at v1; Linux supported in practice).

---

## 2. State Machine

```
                ┌──────────────┐
                │ uninstalled  │
                └──────┬───────┘
                       │ atrace setup / npm postinstall
                       ▼
                ┌──────────────┐  setup throws
                │ setting-up   │ ─────────────────┐
                └──────┬───────┘                  │ rollback
                       │ writes complete          ▼
                       ▼                  ┌──────────────┐
                ┌──────────────┐          │ uninstalled  │
        ┌─────► │    alive     │          └──────────────┘
        │       └──┬─────────┬─┘
re-run  │          │         │ atrace uninstall / preuninstall
setup   │          │         ▼
        │          │  ┌──────────────┐
        │          │  │ uninstalling │
        │          │  └──────┬───────┘
        │          │         │
        │          │         ▼
        │          │  ┌──────────────┐
        │          │  │ uninstalled  │
        │          │  └──────────────┘
        │          │
        │          │ npm rm -g (preuninstall skipped)
        │          ▼
        │   ┌──────────────┐  next Claude tool call
        │   │    stale     │ ──────────────────┐
        │   └──────────────┘                   │ standalone-handler self-heal
        │                                      ▼
        │                                ┌──────────────┐
        │                                │ uninstalled  │
        │                                └──────────────┘
        │
        └─── atrace setup --force
```

Transitions:

| Trigger                          | From         | To             | Code path                                      |
|----------------------------------|--------------|----------------|------------------------------------------------|
| `npm install -g claude-atrace`     | uninstalled  | alive          | `scripts/postinstall.cjs` → `setup()`          |
| `atrace setup`                   | any          | alive          | `src/cli.tsx` → `lifecycle/setup.ts`           |
| `atrace uninstall`               | alive/stale  | uninstalled    | `src/cli.tsx` → `lifecycle/uninstall.ts`       |
| `npm rm -g claude-atrace`          | alive        | stale          | npm skips preuninstall — package files vanish  |
| Claude tool call after `npm rm`  | stale        | uninstalled    | `standalone-handler` self-heal preamble        |
| `atrace doctor --fix`            | stale        | uninstalled    | `lifecycle/doctor.ts`                          |

---

## 3. File Layout

### Inside the npm package

```
claude-atrace/
├── bin/
│   └── atrace.js                      # tiny CJS shim → dist/cli.js
├── dist/                              # tsup output
│   ├── cli.js                         # CLI entry
│   ├── index.js                       # SDK wrapper public API
│   ├── standalone-handler.cjs         # self-contained hook handler (single CJS bundle)
│   ├── lifecycle/
│   │   ├── setup.js
│   │   ├── uninstall.js
│   │   └── doctor.js
│   └── collector/claude-code/
│       └── hook-handler.js            # legacy in-package handler (called via `atrace hook`)
├── scripts/
│   ├── postinstall.cjs                # npm postinstall — calls setup()
│   └── preuninstall.cjs               # npm preuninstall — calls uninstall()
└── package.json
```

### On the user's machine after setup

```
~/.agent-trace/
├── bin/
│   └── hook-handler.cjs               # copy of dist/standalone-handler.cjs
├── state/
│   ├── manifest.json                  # what setup wrote (paths + checksums + version)
│   ├── alive                          # sentinel: pkgVersion + pkgRoot
│   └── settings.backup.<iso>.<name>.json   # rotated backups (keep 5)
├── traces.db                          # SQLite (existing — preserved across uninstall unless --purge)
├── traces.db-wal
├── traces.db-shm
└── debug.log                          # if AGENT_TRACE_DEBUG=1
```

### Claude Code settings (modified by setup)

`~/.claude/settings.json` (user scope) or `./.claude/settings.json` (project scope):

```json
{
  "hooks": {
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /Users/USER/.agent-trace/bin/hook-handler.cjs", "timeout": 5000 }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /Users/USER/.agent-trace/bin/hook-handler.cjs", "timeout": 5000 }] }],
    "UserPromptSubmit": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /Users/USER/.agent-trace/bin/hook-handler.cjs", "timeout": 5000 }] }],
    "Stop":             [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /Users/USER/.agent-trace/bin/hook-handler.cjs", "timeout": 5000 }] }]
  }
}
```

The hook command points to `~/.agent-trace/bin/hook-handler.cjs` — **not** into `node_modules`. That stable path is the load-bearing detail that lets the system survive `npm rm -g`.

---

## 4. Lifecycle Script Contracts

### `scripts/postinstall.cjs`

| Aspect           | Behavior |
|------------------|----------|
| Trigger          | `npm install -g claude-atrace` (and `npm i` in this repo unless `--ignore-scripts`) |
| Skip conditions  | `AGENT_TRACE_SKIP_POSTINSTALL=1`, `AGENT_TRACE_DISABLE_POSTINSTALL=1`, `npm_config_global !== 'true'` |
| Behavior on TTY  | Prompts user via `setup()` |
| Behavior off TTY | `yes: true` (no prompt) — postinstall must not block CI |
| Sudo handling    | Logs warning; `lifecycle/paths.ts` recovers real user's home via `getent` or platform default |
| Failure mode     | Catches all errors, exits 0, logs "run `atrace setup` manually" |
| Inputs           | `process.env.npm_config_global`, TTY status, package version from `../package.json` |
| Outputs          | stdout: status messages prefixed `[agent-trace]`. Side effects: see `setup()` below. |

### `scripts/preuninstall.cjs`

| Aspect          | Behavior |
|-----------------|----------|
| Trigger         | `npm rm -g claude-atrace` (often skipped — npm doesn't reliably fire this for globals) |
| Skip conditions | `npm_config_global !== 'true'` |
| Behavior        | Calls `uninstall({ yes: true })` |
| Failure mode    | Catches all errors, exits 0 — handler still self-heals if this skipped |

### `lifecycle/setup.ts` — `setup(opts: SetupOptions)`

```ts
interface SetupOptions {
  scope?: 'user' | 'project';   // default 'user'
  yes?: boolean;                // skip confirmation
  dryRun?: boolean;             // diff-only, no writes
  force?: boolean;              // re-write even if up to date
  pkgVersion?: string;          // sentinel + manifest field (auto-detected if omitted)
  pkgRoot?: string;             // sentinel pkgRoot (auto-detected if omitted)
  handlerSource?: string;       // override path of standalone-handler.cjs
}
```

Steps:

1. Resolve target settings path (`getSettingsPath(scope)`).
2. Detect Claude Code via `~/.claude/` dir or `claude` on PATH. If absent → confirm or abort.
3. Read existing settings.json. Strict JSON parse — on parse error, back up raw bytes and throw.
4. Build `after = addAtraceHooks(before, command)`. Filters existing `agent-trace`-marked entries before adding fresh ones.
5. If `(before === after) && handler exists && !force` → return `{ status: 'unchanged' }`.
6. If dry-run → print diff, return.
7. Confirm interactively unless `yes`.
8. Backup settings.json → `~/.agent-trace/state/settings.backup.<iso>.<name>.json`. Rotate keep-5.
9. `mkdir -p` state + bin dirs.
10. `atomicCopy(handlerSource, ~/.agent-trace/bin/hook-handler.cjs, 0755)`.
11. `writeSettings(settingsPath, after)` — atomic via tmp+rename.
12. `writeManifest({ version, pkgVersion, installedAt, scope, files, settingsTouched })`.
13. `writeSentinel({ pkgVersion, pkgRoot, writtenAt })`.

Any error in steps 9–13 triggers rollback: restore settings from the just-written backup, surface the error.

Idempotency: settings comparison + handler existence check. `--force` bypasses.

Returns:

```ts
type SetupResult = {
  status: 'installed' | 'unchanged' | 'aborted' | 'dry-run';
  scope: 'user' | 'project';
  settingsPath: string;
  handlerPath: string;
  backupPath?: string;
  message?: string;
}
```

### `lifecycle/uninstall.ts` — `uninstall(opts: UninstallOptions)`

```ts
interface UninstallOptions {
  scope?: 'user' | 'project';   // if omitted, falls back to manifest.settingsTouched
  yes?: boolean;                // skip confirmation
  purge?: boolean;              // also delete ~/.agent-trace (DB + logs)
}
```

Steps (idempotent, best-effort):

1. Read `state/manifest.json` to learn which settings files setup touched. If missing, fall back to user + project paths.
2. For each settings file: read, strip marker entries, atomic write. Backup first.
3. Delete `~/.agent-trace/bin/`, `state/manifest.json`, `state/alive`.
4. If `purge`: delete entire `~/.agent-trace/`.
5. Skip unparseable settings files with a warning — never overwrite corrupt JSON.

### `lifecycle/doctor.ts` — `doctor(opts: { fix?: boolean })`

Diagnoses:

| Check ID                       | Level | Trigger                                                                |
|--------------------------------|-------|------------------------------------------------------------------------|
| `no-manifest`                  | warn  | No state/manifest.json AND no state/alive                              |
| `pkg-stale`                    | error | Sentinel.pkgRoot does not exist                                        |
| `handler-missing`              | error | Sentinel says alive but `bin/hook-handler.cjs` is missing              |
| `settings-corrupt-<scope>`     | error | settings.json fails strict JSON parse                                  |
| `stale-hook-<scope>`           | error | Hook command points to a path that does not exist                      |
| `all-ok`                       | ok    | No issues detected                                                     |

`--fix` runs the per-check fix function:

| Check               | Fix                                                                  |
|---------------------|----------------------------------------------------------------------|
| `pkg-stale`         | Delete `~/.agent-trace/bin` and `~/.agent-trace/state`               |
| `settings-corrupt`  | Restore from latest matching backup (after backing up the corrupt file) |
| `stale-hook`        | Strip marker entries from settings.json                              |

Doctor is the user-facing recovery surface for the failure modes in §8.

---

## 5. Self-Heal Protocol

Goal: even if the user runs `npm rm -g claude-atrace` without `atrace uninstall`, the next Claude Code tool call cleans up after itself.

### Why it works

The hook command in `settings.json` points to `~/.agent-trace/bin/hook-handler.cjs`, **outside** `node_modules`. That file persists after `npm rm -g`. When Claude spawns it, the handler runs its self-heal preamble before touching SQLite or any DB native bindings.

### Sentinel format (`~/.agent-trace/state/alive`)

```json
{
  "pkgVersion": "0.1.0",
  "pkgRoot":    "/usr/local/lib/node_modules/claude-atrace",
  "writtenAt":  "2026-05-09T09:43:00.000Z"
}
```

- `pkgRoot` is the absolute path of the installed package, captured at setup time.
- `pkgRoot` existence on disk = "package is alive."

### Detection algorithm

```ts
function isStale(sentinel) {
  if (!sentinel) return false;        // never installed via setup, do nothing weird
  return !fs.existsSync(sentinel.pkgRoot);
}
```

### Salvage steps (in order)

1. Drain stdin — do not leave Claude's pipe blocked.
2. For each candidate settings path (`~/.claude/settings.json`, `./.claude/settings.json`): strip entries whose `command` includes `agent-trace`.
3. Recursively delete `~/.agent-trace/bin/` and `~/.agent-trace/state/`.
4. Write `{}` to stdout. Exit 0.

After this, Claude Code never spawns the handler again — its hook entries are gone from settings.json.

### Why not preuninstall alone?

npm runs preuninstall scripts inconsistently for global packages. Common skips:

- `npm uninstall -g` with `--ignore-scripts`
- `pnpm`, `yarn global remove`
- Manual `rm -rf $(npm root -g)/agent-trace`

Self-heal works under all of them.

### Why not `npx`-style shim?

Two reasons. First, `npx` wants to download. Second, `node_modules`-resolved shims fail the moment the package is gone. The stable-path approach makes the package's presence optional at runtime.

---

## 6. Atomic Write Protocol

Every write to settings.json or to state files goes through `atomicWrite`:

```ts
function atomicWrite(path, data, mode?) {
  mkdir -p dirname(path);
  write(path + '.tmp.<pid>.<ts>', data);
  if (mode && posix) chmod(tmp, mode);
  rename(tmp, path);   // atomic on same volume on POSIX + NTFS
}
```

The handler copy uses `atomicCopy` (same pattern with `copyFileSync`). Tmp files are cleaned up on error.

`fsync` is intentionally not called: settings.json is small enough that durability after crash is not worth the per-write cost. Worst case: the user re-runs `atrace setup`.

---

## 7. Manifest Schema

`~/.agent-trace/state/manifest.json`:

```ts
interface Manifest {
  version: 1;                        // schema version; bump triggers re-install on read
  pkgVersion: string;                // e.g. "0.1.0"
  installedAt: string;               // ISO-8601
  scope: 'user' | 'project';
  files: Array<{
    path: string;
    kind: 'settings' | 'handler' | 'state';
  }>;
  settingsTouched: string[];         // paths uninstall should clean
}
```

If `version` does not match `MANIFEST_VERSION`, `readManifest()` returns null and uninstall falls back to scanning known settings paths by marker.

---

## 8. Cross-Platform Matrix

| Aspect              | macOS / Linux                                | Windows                                  |
|---------------------|----------------------------------------------|------------------------------------------|
| Settings path       | `~/.claude/settings.json`                    | `%USERPROFILE%\.claude\settings.json`    |
| State path          | `~/.agent-trace/`                            | `%USERPROFILE%\.agent-trace\`            |
| Atomic rename       | POSIX `rename(2)` — atomic on same volume    | NTFS `MoveFileEx` — atomic on same volume |
| chmod 0755          | yes (handler executable)                     | skipped (Windows ignores POSIX modes)    |
| Hook command form   | `node /abs/path/hook-handler.cjs`            | `node "C:\Users\X\.agent-trace\bin\hook-handler.cjs"` |
| Sudo home recovery  | `getent passwd $SUDO_USER` → fallback `/Users` or `/home` | not applicable                            |
| Claude detection    | `~/.claude` exists OR `which claude`         | `~/.claude` exists OR `where claude`     |

Handler is bundled with `#!/usr/bin/env node` shebang. On Windows the shebang is ignored; the hook command always uses an explicit `node` prefix to handle both.

---

## 9. Failure-Mode Reference

| Scenario                                            | What happens                                                                      | User recovery                              |
|-----------------------------------------------------|-----------------------------------------------------------------------------------|--------------------------------------------|
| Postinstall in CI / no TTY                          | Runs with `yes: true`. If detection fails, exits 0 with log line.                 | `atrace setup` after deploy                |
| Postinstall under `sudo`                            | Real user's home detected via getent / platform default. Logs a warning.          | none                                       |
| Postinstall fails for any reason                    | Error logged, exit 0. `npm install` succeeds.                                     | `atrace setup` manually                    |
| `settings.json` is not valid JSON                   | Setup throws. Raw bytes preserved. No write performed.                            | Fix file → re-run setup, or `atrace doctor --fix` (restores latest backup) |
| Permission denied on `~/.claude/`                   | `atomicWrite` throws EACCES. Setup rolls back.                                    | Fix permissions; do not run setup with sudo |
| Mid-setup crash                                     | Backup restore in `catch`. Manifest may be missing → next setup re-runs cleanly.  | `atrace setup` again                       |
| User manually deletes `~/.agent-trace/bin/`         | `doctor` reports `handler-missing`. Setup `--force` re-copies.                    | `atrace setup --force`                     |
| `npm rm -g` without `atrace uninstall`              | Sentinel.pkgRoot missing → next Claude tool call salvages settings + state.       | none required                              |
| Reinstall after partial uninstall                   | Marker dedup handles leftover entries. Setup proceeds.                            | none                                       |
| Two atrace versions installed (npx + global)        | Marker filter strips all `agent-trace` entries before adding fresh ones.          | none — last writer wins                    |

---

## 10. Backup & Rotation Policy

- File pattern: `~/.agent-trace/state/settings.backup.<iso>.<basename>.json`
- Created automatically by setup (before write) and uninstall (before write).
- Keep 5 most recent (rotated by mtime descending). Older backups are deleted silently.
- `latestBackupFor(path)` selects the newest backup matching the original file's basename — used by `doctor --fix` for `settings-corrupt`.

Restoration is not automatic on read errors. The user opts in via `doctor --fix` so a corrupt user-edited file isn't silently overwritten.

---

## 11. Testing Strategy

Tests live in `test/lifecycle/`:

- `setup.test.ts` — fixture-based: empty settings, populated settings, marker dedup, corrupt JSON, missing dir, dry-run, idempotency, manifest/sentinel write.
- `uninstall.test.ts` — round-trip: setup → uninstall → settings restored to pre-state. Covers `--purge` and idempotency.
- `self-heal.test.ts` — direct unit tests for `isStale`, `salvageSettingsFile`, `salvageAll`. No subprocess required.

Test isolation:

- Each test creates a unique tmp directory via `mkdtempSync`.
- `HOME`, `USERPROFILE`, and `AGENT_TRACE_HOME` env vars are pointed at the tmp dir before each test.
- ESM cache is busted with a query-string suffix on the import URL so each test re-reads env vars.

Cross-platform tests (mocking `os.platform()`) are deferred — the underlying paths are computed via `os.homedir()` which the runtime handles.

---

## 12. Related ADRs

- [ADR-011](decisions.md): Full-refresh polling — orthogonal but explains why hook handler updates rows in place.
- [ADR-012](decisions.md): Auto-session creation — why hook handler can `INSERT OR IGNORE` a session row before any `SessionStart`.
- [ADR-013](decisions.md): Transcript parsing in TUI — keeps the handler's <200ms budget intact, also relevant to standalone-handler bundle size.
- [ADR-014](decisions/ADR-014-self-healing-lifecycle.md): Stable-path self-healing hook handler — the canonical decision record for the lifecycle redesigned in this document.
