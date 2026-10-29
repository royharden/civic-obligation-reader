import {it,expect} from 'vitest';
import {asOf} from '../../src/core/asof';
import {amendment,packet,section} from './helpers';
it('UNSTRUCTURED: keeps old text visibly tainted, never silently current',()=>{const r=asOf(packet([amendment('A','unstructured')]),'2026-03-01');expect(r.provisions[0]?.text).toBe('alpha beta');expect(r.provisions[0]?.tainted).toBe('amendment_unapplied');expect(r.unapplied[0]?.reason).toBe('amendment_unapplied');});
it('OP-FAIL-WHOLE-TARGET: failed op taints every declared target atomically',()=>{const p=packet([amendment('A',[{op:'replaceText',sectionId:'sec-1',old:'alpha',new:'changed'},{op:'insertAfter',sectionId:'sec-2',anchor:'missing',text:'new'}],['sec-1','sec-2'])],[section(1,'alpha'),section(2,'beta')]);const r=asOf(p,'2026-03-01');expect(r.provisions.map(s=>[s.text,s.tainted])).toEqual([['alpha','amendment_unapplied'],['beta','amendment_unapplied']]);});
