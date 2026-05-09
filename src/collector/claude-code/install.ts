// Back-compat shim. The real lifecycle code now lives under src/lifecycle/.
// Existing imports of `install` / `uninstall` / `getHookCommand` still work.
import { setup as runSetup } from '../../lifecycle/setup.js';
import { uninstall as runUninstall } from '../../lifecycle/uninstall.js';
export { getHookCommand } from '../../lifecycle/paths.js';
export { HOOK_MARKER, HOOK_EVENTS } from '../../types/claude-settings.js';

export async function install(options: { scope?: 'user' | 'project' } = {}): Promise<void> {
  const result = await runSetup({ scope: options.scope ?? 'user', yes: true });
  console.log(result.message ?? `Status: ${result.status}`);
}

export async function uninstall(options: { scope?: 'user' | 'project' } = {}): Promise<void> {
  const result = await runUninstall({ scope: options.scope ?? 'user', yes: true });
  console.log(`Removed ${result.removedHookEntries} hook entries.`);
}
