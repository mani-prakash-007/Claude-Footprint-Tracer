import readline from 'node:readline';

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return defaultYes;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise((resolve) => {
    rl.question(`${question} ${suffix} `, (ans) => {
      rl.close();
      const a = ans.trim().toLowerCase();
      if (a === '') return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}
