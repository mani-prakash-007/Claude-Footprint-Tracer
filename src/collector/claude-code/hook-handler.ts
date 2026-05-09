import { runHookHandler } from './hook-runner.js';

runHookHandler().catch((err) => {
  process.stderr.write(`agent-trace hook error: ${(err as Error).message}\n`);
  process.stdout.write('{}');
  process.exit(0);
});
