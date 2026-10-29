import { openSync, closeSync, unlinkSync, writeSync } from 'node:fs';
export function acquireRunLock(path: string): () => void {
  const fd = openSync(path, 'wx', 0o600);
  try { writeSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); }
  catch (error) { closeSync(fd); unlinkSync(path); throw error; }
  let released = false;
  return () => { if (!released) { closeSync(fd); unlinkSync(path); released = true; } };
}
