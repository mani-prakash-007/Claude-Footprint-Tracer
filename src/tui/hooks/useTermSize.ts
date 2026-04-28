import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface TermSize {
  width: number;
  height: number;
}

/**
 * Live terminal dimensions. Re-reads on SIGWINCH so layouts respond when
 * the user resizes the window mid-session.
 */
export function useTermSize(): TermSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TermSize>({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
  });

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({ width: stdout.columns ?? 80, height: stdout.rows ?? 24 });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
