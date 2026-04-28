import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';

export type MouseButton = 'left' | 'middle' | 'right' | 'wheel-up' | 'wheel-down';
export type MouseAction = 'press' | 'release' | 'drag' | 'wheel';

export interface MouseEvent {
  button: MouseButton;
  action: MouseAction;
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export type MouseHandler = (event: MouseEvent) => void;

const ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
const DISABLE = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

/**
 * Mouse + touchpad input. Enables SGR mouse tracking on the terminal,
 * parses incoming escape sequences, and fires `handler` for each event.
 *
 * The handler is captured via ref so the effect mounts ONCE per stdin —
 * passing a new handler each render does not re-enable mouse mode.
 *
 * Caveats:
 * - tmux requires `set -g mouse on`.
 * - mosh strips mouse events (keyboard fallback works).
 */
export function useMouse(handler: MouseHandler): void {
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const handlerRef = useRef<MouseHandler>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!stdin || !setRawMode || !isRawModeSupported) return;
    setRawMode(true);

    const writable = process.stdout;
    if (writable.isTTY) writable.write(ENABLE);

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let match: RegExpExecArray | null;
      SGR_RE.lastIndex = 0;
      while ((match = SGR_RE.exec(text)) !== null) {
        const code = Number(match[1]);
        const x = Number(match[2]);
        const y = Number(match[3]);
        const isPress = match[4] === 'M';

        const buttonBits = code & 0b11;
        const isMotion = (code & 32) !== 0;
        const isWheel = (code & 64) !== 0;
        const shift = (code & 4) !== 0;
        const alt = (code & 8) !== 0;
        const ctrl = (code & 16) !== 0;

        let button: MouseButton;
        let action: MouseAction;
        if (isWheel) {
          button = buttonBits === 0 ? 'wheel-up' : 'wheel-down';
          action = 'wheel';
        } else {
          button = buttonBits === 0 ? 'left' : buttonBits === 1 ? 'middle' : 'right';
          action = isMotion ? 'drag' : isPress ? 'press' : 'release';
        }

        try {
          handlerRef.current({ button, action, x, y, shift, ctrl, alt });
        } catch {
          // never let a handler crash break the input loop
        }
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
      if (writable.isTTY) writable.write(DISABLE);
    };
  }, [stdin, setRawMode, isRawModeSupported]);
}
