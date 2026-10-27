import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
describe('honest metric block (authored, not executed)', () => {
  it('keeps the unmeasured README block byte-identical to its template', () => {
    const root = new URL('../../', import.meta.url);
    const readme = readFileSync(new URL('README.md', root), 'utf8');
    const template = readFileSync(new URL('docs/README-METRICS.template.md', root), 'utf8').trim();
    const block = readme.match(/<!-- s46:measured-results:start -->[\s\S]*?<!-- s46:measured-results:end -->/)?.[0];
    expect(block).toBeDefined();
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    expect(hash(block!)).toBe(hash(template));
  });
});
