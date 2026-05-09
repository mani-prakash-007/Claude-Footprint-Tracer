import {
  writeFileSync,
  renameSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

export function atomicWrite(path: string, data: string | Buffer, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, data);
    if (mode !== undefined && process.platform !== 'win32') {
      try {
        chmodSync(tmp, mode);
      } catch {
        // best-effort
      }
    }
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore cleanup error
      }
    }
    throw err;
  }
}

export function atomicCopy(src: string, dest: string, mode?: number): void {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
  try {
    copyFileSync(src, tmp);
    if (mode !== undefined && process.platform !== 'win32') {
      try {
        chmodSync(tmp, mode);
      } catch {
        // best-effort
      }
    }
    renameSync(tmp, dest);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore cleanup error
      }
    }
    throw err;
  }
}
