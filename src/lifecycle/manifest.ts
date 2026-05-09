import { existsSync, readFileSync } from 'node:fs';
import { atomicWrite } from './atomic.js';
import { getManifestPath, getSentinelPath } from './paths.js';

export const MANIFEST_VERSION = 1;

export interface ManifestFile {
  path: string;
  kind: 'settings' | 'handler' | 'state';
}

export interface Manifest {
  version: number;
  pkgVersion: string;
  installedAt: string;
  scope: 'user' | 'project';
  files: ManifestFile[];
  settingsTouched: string[];
}

export interface Sentinel {
  pkgVersion: string;
  pkgRoot: string;
  writtenAt: string;
}

export function readManifest(): Manifest | null {
  const path = getManifestPath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Manifest;
    if (data.version !== MANIFEST_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeManifest(m: Manifest): void {
  atomicWrite(getManifestPath(), JSON.stringify(m, null, 2) + '\n');
}

export function readSentinel(): Sentinel | null {
  const path = getSentinelPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Sentinel;
  } catch {
    return null;
  }
}

export function writeSentinel(s: Sentinel): void {
  atomicWrite(getSentinelPath(), JSON.stringify(s, null, 2) + '\n');
}

export function isPkgAlive(s: Sentinel | null): boolean {
  if (!s) return false;
  return existsSync(s.pkgRoot);
}
