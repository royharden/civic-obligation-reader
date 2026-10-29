import {it,expect} from 'vitest';
import {asOf} from '../../src/core/asof';
import {highestTaint,taintKey} from '../../src/core/taint';
import type {Taint} from '../../src/core/types';
import {amendment,packet,section} from './helpers';
it('TAINT-SKIP: any dirty target skips all ops and taints only clean targets',()=>{const p=packet([amendment('A','unstructured'),amendment('B',[{op:'replaceText',sectionId:'sec-2',old:'beta',new:'new'}],['sec-1','sec-2'],{effectiveOn:'2026-04-01'})],[section(1,'alpha'),section(2,'beta')]);const r=asOf(p,'2026-04-01');expect(r.provisions.map(s=>[s.text,s.tainted])).toEqual([['alpha','amendment_unapplied'],['beta','dependency_tainted']]);expect(r.taints).toHaveLength(2);expect(r.unapplied[1]?.reason).toBe('dependency_tainted');});
it('TAINT-PRECEDENCE: all records survive while provision exposes highest',()=>{const taints:Taint[]=(['dependency_tainted','amendment_unapplied','retroactive_unsupported','amendment_conflict'] as const).map((reason,i)=>({sectionId:'sec-1',reason,amendmentId:`A${i}`,from:'2026-03-01'}));expect(highestTaint(taints,'sec-1')).toBe('amendment_conflict');expect(taintKey(taints,['sec-1'])).toContain('retroactive_unsupported');expect(taintKey(taints,['sec-2'])).toBe('');expect(taints).toHaveLength(4);});
