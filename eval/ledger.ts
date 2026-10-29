import { openSync,writeSync,fsyncSync,closeSync,lstatSync,existsSync, readFileSync, realpathSync,readdirSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute,join,basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Completion, CompletionRequest, Provider } from './providers/port';
export interface Price { inputMicroUsdPerMillion: number; outputMicroUsdPerMillion: number; edition: string }
export interface ScheduledCall { inputTokenBound: number; outputTokenBound: number; price: Price }
function integer(n: number): void { if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid cost bound'); }
export function maximumCharge(call: ScheduledCall): number {
  integer(call.inputTokenBound); integer(call.outputTokenBound);
  integer(call.price.inputMicroUsdPerMillion); integer(call.price.outputMicroUsdPerMillion);
  const value = (BigInt(call.inputTokenBound) * BigInt(call.price.inputMicroUsdPerMillion) +
    BigInt(call.outputTokenBound) * BigInt(call.price.outputMicroUsdPerMillion) + 999_999n) / 1_000_000n;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cost overflow');
  return Number(value);
}
export function scheduleMaximum(calls: ScheduledCall[]): number {
  const sum = calls.reduce((n, c) => n + BigInt(maximumCharge(c)), 0n);
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('schedule overflow');
  return Number(sum); // Deliberately uncapped. Compare the full number before unsealing.
}
interface Entry { kind: 'reserve' | 'settle'; id: string; microUsd: number; runKind: 'measured'; at: string;allocation?:string }
export class Ledger {
  readonly path: string;
  readonly cap: number;
  readonly lifetimePath:string;
  constructor(path: string, cap: number, repoRoot: string) {
    integer(cap);
    if (cap > 40_000_000) throw new Error('Roy ceiling exceeded');
    this.path = resolve(realpathSync(dirname(path)), relative(dirname(path), path));
    if(existsSync(this.path)&&lstatSync(this.path).isSymbolicLink())throw new Error('ledger must not be a symlink');
    const rel = relative(realpathSync(repoRoot), existsSync(this.path) ? realpathSync(this.path) : this.path);
    if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('ledger must be outside repo');
    this.cap = cap;
    this.lifetimePath=join(dirname(this.path),'lifetime.jsonl');
    if(this.path===this.lifetimePath)throw new Error('Lifetime ledger cannot be used as an allocation ledger');
    if(existsSync(this.lifetimePath)&&lstatSync(this.lifetimePath).isSymbolicLink())throw new Error('Lifetime ledger must not be a symlink');
  }
  private entries(path:string,allocation?:string):Map<string,number> {
    const entries = new Map<string, number>();
    const allocations=new Map<string,string|undefined>();
    if(!existsSync(path))return entries;
    if(lstatSync(path).isSymbolicLink())throw new Error('Ledger symlink refused');
    for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
      const e = JSON.parse(line) as Entry;
      integer(e.microUsd);
      if (!e.id || e.runKind !== 'measured') throw new Error('invalid ledger');
      if(path===this.lifetimePath&&(typeof e.allocation!=='string'||!/^[A-Za-z0-9_-]+\.jsonl$/.test(e.allocation)))throw new Error('Lifetime reservation lacks allocation identity');
      if(allocation!==undefined&&e.allocation!==allocation)continue;
      if (e.kind === 'reserve') { if (entries.has(e.id)) throw new Error('duplicate reservation'); entries.set(e.id, e.microUsd);allocations.set(e.id,e.allocation); }
      else if (e.kind === 'settle') {
        const prior = entries.get(e.id);
        if (prior === undefined || e.microUsd > prior || allocations.get(e.id)!==e.allocation) throw new Error('invalid settlement');
        entries.set(e.id, e.microUsd);
      } else throw new Error('invalid ledger entry');
    }
    return entries;
  }
  reserved():number {
    const entries=this.entries(this.path);
    // Aggregate-first fsync can leave a crash reservation without a phase append.
    // Preserve that charge in BOTH the app and its approved phase allocation.
    for(const [id,charge] of this.entries(this.lifetimePath,basename(this.path)))entries.set(id,Math.max(entries.get(id)??0,charge));
    const total=[...entries.values()].reduce((a,b)=>a+b,0);integer(total);return total;
  }
  lifetimeReserved():number {
    const all=this.entries(this.lifetimePath);
    // An old/moved edition may not silently reset the app ceiling. Missing aggregate
    // reservations fail closed for owner reconciliation, rather than guessing history.
    for(const name of readdirSync(dirname(this.path)).filter(n=>n.endsWith('.jsonl')&&n!=='lifetime.jsonl'))for(const [id,charge] of this.entries(join(dirname(this.path),name))){if(!all.has(id)||all.get(id)! < charge)throw new Error('Allocation ledger is not covered by app lifetime ledger');}
    const total=[...all.values()].reduce((a,b)=>a+b,0);integer(total);return total;
  }
  remaining():number {return Math.min(this.cap-this.reserved(),40_000_000-this.lifetimeReserved());}
  private append(kind: Entry['kind'], id: string, microUsd: number,path=this.path): void {
    const fd=openSync(path,'a',0o600);
    try{writeSync(fd,JSON.stringify({ kind, id, microUsd, runKind: 'measured', at: new Date().toISOString(),allocation:basename(this.path) } satisfies Entry) + '\n');fsyncSync(fd);}finally{closeSync(fd);}
  }
  async dispatch(provider: Provider, request: CompletionRequest, bound: ScheduledCall): Promise<Completion> {
    // Caller must hold the exclusive run lock across schedule check and all dispatches.
    if (this.cap === 0) throw new Error('disabled: live cap is zero');
    if (!bound.price.edition || request.maxOutputTokens !== bound.outputTokenBound) throw new Error('unfrozen dispatch bounds');
    // An SDK token estimate is not an upper bound. Byte length bounds BPE token count conservatively.
    const inputBytes = Buffer.byteLength(JSON.stringify(request), 'utf8') + 4096;
    if (inputBytes > bound.inputTokenBound) throw new Error('input exceeds reserved bound');
    const reservation = maximumCharge(bound);
    if (reservation > this.remaining()) throw new Error('budget exhausted before dispatch (allocation or app lifetime)');
    const id = randomUUID(); this.append('reserve', id, reservation,this.lifetimePath);this.append('reserve', id, reservation);
    const response = await provider.complete(request); // one attempt; failures retain the reservation
    if (response.modelReturned !== request.model) throw new Error('returned model differs from frozen model');
    if (response.usage.inputTokens !== null && response.usage.outputTokens !== null) {
      const actual = maximumCharge({ ...bound, inputTokenBound: response.usage.inputTokens, outputTokenBound: response.usage.outputTokens });
      if (actual > reservation) throw new Error('provider exceeded bound; reservation retained; stop run');
      this.append('settle', id, actual);
      this.append('settle', id, actual,this.lifetimePath);
    }
    return response;
  }
}
