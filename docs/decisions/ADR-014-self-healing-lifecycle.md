# ADR-014: Stable-Path Self-Healing Hook Handler

**Status:** Accepted
**Date:** 2026-05-09
**Supersedes:** Original `install.ts` install/uninstall implementation

## Context

`atrace` registers four hook entries (PreToolUse, PostToolUse, UserPromptSubmit, Stop) in Claude Code's `~/.claude/settings.json`. Each entry stores the command Claude should spawn for that event. Until this ADR, that command pointed inside the npm package's `node_modules` directory:

```
node /usr/local/lib/node_modules/agent-trace/dist/collector/claude-code/hook-handler.js
```

The original install function had no atomic writes, no backups, no rollback, and no test coverage. More critically: `package.json` had no `postinstall` or `preuninstall` scripts, so the user had to manually run `atrace install`, and `npm uninstall -g agent-trace` deleted the package files but left the hook entries in `settings.json` pointing at a path that no longer existed. Every subsequent tool call in Claude Code surfaced an error.

We need:

1. Auto-registration on `npm install -g agent-trace`.
2. A reverse path that survives `npm uninstall -g` even when npm skips lifecycle scripts (which it commonly does for global packages).
3. Atomic, transactional setup with rollback and idempotency.

## Decision

### 1. Stable runtime path for the hook handler

Setup copies the bundled handler to `~/.agent-trace/bin/hook-handler.cjs` and writes that path into `settings.json`. The hook command no longer resolves into `node_modules`. After `npm rm -g`, the file at `~/.agent-trace/bin/` still exists and Claude Code can still spawn it.

### 2. Sentinel + self-heal preamble

At setup time we write `~/.agent-trace/state/alive`:

```json
{ "pkgVersion": "0.1.0", "pkgRoot": "/usr/local/lib/node_modules/agent-trace" }
```

The handler runs a self-heal preamble before any DB import:

```
if (!fs.existsSync(sentinel.pkgRoot)) {
  drain stdin; strip own entries from settings.json; rm -rf bin/ state/; exit 0;
}
```

A stale handler thus uninstalls itself on the next Claude tool call and Claude never spawns it again.

### 3. Postinstall + preuninstall scripts (best-effort)

`scripts/postinstall.cjs` runs `setup({ yes: !TTY })` only when `npm_config_global === 'true'`, swallows all errors, and exits 0. `scripts/preuninstall.cjs` runs `uninstall({ yes: true })` and likewise exits 0. Neither is load-bearing; the self-heal path covers their failure.

### 4. Transactional setup

Setup follows: detect → read → diff → confirm → backup → atomic copy handler → atomic write settings → manifest → sentinel. Failures in the write phase trigger a backup-restore rollback. Re-runs are idempotent via marker dedup; `--force` bypasses the unchanged check.

### 5. Doctor as recovery UX

`atrace doctor` enumerates failure states (stale package, missing handler, corrupt settings, broken hook paths) and offers `--fix`. This is the user-visible repair path that leverages backups + the salvage logic.

## Consequences

**Positive:**
- `npm rm -g agent-trace` no longer leaves the user with a broken Claude Code session, even without running `atrace uninstall` first.
- Transactional installs prevent half-applied state.
- Backup before every settings mutation.
- Tests now cover lifecycle (zero before).
- `atrace doctor` is a single user-facing command that diagnoses and repairs every known failure mode.

**Negative:**
- Setup now copies the handler, so the bundled file must be self-contained. We added a 4th tsup entry (`standalone-handler.cjs`) that bundles all dependencies inline except `better-sqlite3` (native).
- Two paths exist for the handler now: the legacy `dist/collector/claude-code/hook-handler.js` (called via `atrace hook`) and the standalone `~/.agent-trace/bin/hook-handler.cjs`. Both delegate to a shared `runHookHandler()` so logic stays in one place.
- Setup writes to a state directory the user did not previously have. We document it and offer `--purge` to wipe it.

## Alternatives Considered

### A. `preuninstall` only (rejected)

Simplest possible fix: add `preuninstall` to package.json. Rejected because npm skips lifecycle scripts on global packages frequently (`--ignore-scripts`, pnpm, yarn global, manual `rm -rf`). The reported bug — stale hooks after uninstall — would resurface in those cases.

### B. `npx` wrapper command (rejected)

Hook command becomes `npx -y agent-trace hook`. Rejected: `npx` would re-download a deleted package, defeating the uninstall intent; and runtime cost per tool call is unacceptable.

### C. Version-pinned wrapper script (rejected)

Write a static shell wrapper that resolves the package at runtime. Rejected: still depends on the package being installed, and adds a shell-dependent execution layer that complicates Windows support.

### D. Combine A + B + C (rejected)

Maximum redundancy but maximum maintenance burden. The stable-path + sentinel approach already gives full robustness with one well-tested mechanism.

## References

- Detailed implementation: [docs/lifecycle.md](../lifecycle.md)
- Source of truth: `src/lifecycle/`, `src/collector/claude-code/standalone-handler.ts`, `scripts/postinstall.cjs`, `scripts/preuninstall.cjs`
- Tests: `test/lifecycle/`
