import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger, maximumCharge, scheduleMaximum } from '../../eval/ledger';
import { MockProvider } from '../../eval/providers/mock';
const request = { model: 'pinned', messages: [{ role: 'user' as const, content: 'x' }], schema: {}, maxOutputTokens: 100 };
const bound = { inputTokenBound: 10000, outputTokenBound: 100, price: { inputMicroUsdPerMillion: 1_000_000, outputMicroUsdPerMillion: 1_000_000, edition: 'test' } };
const provider = () => new MockProvider({ value: {}, modelReturned: 'pinned', latencyMs: 0, usage: { inputTokens: null, outputTokens: null } });
function setup(cap: number) {
  const dir = mkdtempSync(join(tmpdir(), 's46-ledger-'));
  const repo = join(dir, 'repo'); mkdirSync(repo);
  return { ledger: new Ledger(join(dir, 'ledger.jsonl'), cap, repo), path: join(dir, 'ledger.jsonl') };
}
describe('budget boundary (authored, not executed)', () => {
  it('cap zero refuses before adapter invocation', async () => {
    const p = provider(); await expect(setup(0).ledger.dispatch(p, request, bound)).rejects.toThrow('disabled'); expect(p.calls).toHaveLength(0);
  });
  it('excess reservation refuses before adapter invocation', async () => {
    const p = provider(); await expect(setup(1).ledger.dispatch(p, request, bound)).rejects.toThrow('budget'); expect(p.calls).toHaveLength(0);
  });
  it('unknown usage retains the full reservation', async () => {
    const { ledger, path } = setup(40_000_000); await ledger.dispatch(provider(), request, bound);
    expect(ledger.reserved()).toBe(maximumCharge(bound)); expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(1);
  });
  it('does not clip the full schedule to the cap', () => {
    expect(scheduleMaximum([bound, bound])).toBe(2 * maximumCharge(bound));
  });
  it('app lifetime cap aggregates dev and sealed reservations across experiment editions',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'s46-lifetime-')),repo=join(dir,'repo');mkdirSync(repo);
    const first=new Ledger(join(dir,'edition-one-dev.jsonl'),40_000_000,repo),second=new Ledger(join(dir,'edition-two-sealed.jsonl'),40_000_000,repo);
    const large={inputTokenBound:30_000_000,outputTokenBound:100,price:bound.price};await first.dispatch(provider(),request,large);
    expect(second.lifetimeReserved()).toBe(maximumCharge(large));const p=provider();await expect(second.dispatch(p,request,{...large,inputTokenBound:11_000_000})).rejects.toThrow(/lifetime/);expect(p.calls).toHaveLength(0);expect(second.reserved()).toBe(0);
  });
  it('aggregate-first crash reservation remains charged to its phase even without a phase file',()=>{
    const dir=mkdtempSync(join(tmpdir(),'s46-reservation-crash-')),repo=join(dir,'repo');mkdirSync(repo);
    writeFileSync(join(dir,'lifetime.jsonl'),JSON.stringify({kind:'reserve',id:'synthetic-crash',microUsd:100,runKind:'measured',at:'2026-01-01T00:00:00Z',allocation:'pilot-dev.jsonl'})+'\n');
    const ledger=new Ledger(join(dir,'pilot-dev.jsonl'),100,repo);expect(ledger.reserved()).toBe(100);expect(ledger.lifetimeReserved()).toBe(100);expect(ledger.remaining()).toBe(0);
  });
});
