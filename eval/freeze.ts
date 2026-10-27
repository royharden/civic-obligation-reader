import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ScheduledCall } from './ledger';
export interface FrozenModelArm extends ScheduledCall {arm:'M1a'|'M1b-small'|'M1b-mid'|'H';provider:'anthropic'|'openai_compatible';tier:'small'|'mid'}
export interface OwnerApproval {approvedBy:string;approvalId:string}
export interface Experiment {
  schemaVersion: 's46.experiment.v1'; frozen: boolean; experimentId: string;
  defaultArm: 'B0' | 'H'; strongerM1b: 'M1b-small' | 'M1b-mid' | null;
  models: { small: string | null; mid: string | null }; priceEdition: string | null;
  capsMicroUsd: { dev: number; sealed: number }; seeds: { sample: 46027; bootstrap: 46028 };
  files: Record<string, string>; consumed: boolean;
  modelArms?: FrozenModelArm[];
  ownerApproval?:OwnerApproval|null;
  selectionEvidence?:{pilotId:string;receiptSha256:string}|null;
}
export function sha256Bytes(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function verifyFreeze(experiment: Experiment, read: (path: string) => Uint8Array = p => readFileSync(p)): void {
  if (experiment.schemaVersion !== 's46.experiment.v1' || !experiment.frozen || !experiment.experimentId || experiment.consumed) throw new Error('experiment not frozen or consumed');
  const { dev, sealed } = experiment.capsMicroUsd;
  if (![dev, sealed].every(n => Number.isSafeInteger(n) && n >= 0) || dev + sealed > 40_000_000) throw new Error('invalid experiment cap');
  if (Object.keys(experiment.files).length === 0) throw new Error('empty freeze');
  if(!['B0','H'].includes(experiment.defaultArm)||experiment.seeds.sample!==46027||experiment.seeds.bootstrap!==46028)throw new Error('unfrozen selection/seeds');
  for (const [path, expected] of Object.entries(experiment.files)) {
    if (/(^|[\\/])\.env(?:\.|$)/.test(path)) throw new Error('environment files are excluded from freeze');
    if (!/^[a-f0-9]{64}$/.test(expected) || sha256Bytes(read(path)) !== expected) throw new Error('frozen input changed');
  }
}
/** The same clean source edition is used by the dev pilot and the later freeze.
 * All generated measurements live outside the repo; legacy results are not source.
 */
export function repositorySourceInventory(repo:string):Record<string,string> {
  const root = realpathSync(repo);
  const listed = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  const dirty = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  if (listed.status !== 0 || dirty.status !== 0 || dirty.stdout.trim()) throw new Error('freeze requires a clean committed repository');
  // Never inventory or open any environment file, including the tracked example.
  const paths = listed.stdout.split('\0').filter(Boolean).filter(p => p !== 'eval/experiment.json' && !p.startsWith('results/') && !/(^|[\\/])\.env(?:\.|$)/.test(p));
  const inventory:Record<string,string>={};
  for(const path of paths){
    if (isAbsolute(path) || path.split(/[\\/]/).includes('..') || /(^|[\\/])\.env(?:\.|$)/.test(path)) throw new Error('invalid frozen path');
    const file = resolve(root, path), rel = relative(root, realpathSync(file));
    if (lstatSync(file).isSymbolicLink() || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('frozen file escaped repository');
    inventory[path]=sha256Bytes(readFileSync(file));
  }
  return inventory;
}
export function verifyRepositoryFreeze(experiment: Experiment, repo: string): void {
  const actual=repositorySourceInventory(repo);
  if(Object.keys(actual).length!==Object.keys(experiment.files).length||Object.entries(actual).some(([path,hash])=>experiment.files[path]!==hash))throw new Error('freeze inventory differs from tracked source');
  verifyFreeze(experiment,path=>readFileSync(resolve(repo,path)));
}
