export function installKeylessFetchGuard(configured: boolean): () => void {
  if (configured) return () => {};
  const original = globalThis.fetch;
  const blocked: typeof fetch = async () => { throw new Error('Network disabled in keyless local mode'); };
  globalThis.fetch = blocked;
  return () => { if (globalThis.fetch === blocked) globalThis.fetch = original; };
}
