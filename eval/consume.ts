import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
export function consumeBeforeDispatch(path: string, experimentId: string): void {
  // Never removed on error. A failed attempt consumes this edition too.
  const fd = openSync(path, 'wx', 0o600);
  try { writeSync(fd, JSON.stringify({ experimentId, consumedAt: new Date().toISOString() })); fsyncSync(fd); }
  finally { closeSync(fd); }
}
