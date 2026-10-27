import {it,expect} from 'vitest';
import {asOf} from '../../src/core/asof';
import {amendment,packet,section} from './helpers';
it('OP-REPEAL: absent at effective boundary, retained immediately before',()=>{const p=packet([amendment('A',[{op:'repealSection',sectionId:'sec-1'}])]);expect(asOf(p,'2026-02-28').provisions.map(s=>s.sectionId)).toEqual(['sec-1']);expect(asOf(p,'2026-03-01').provisions).toEqual([]);});
it('ABSENT-TARGET: later edit to a repealed known id is unapplied',()=>{const p=packet([amendment('A',[{op:'repealSection',sectionId:'sec-1'}]),amendment('B',[{op:'replaceText',sectionId:'sec-1',old:'alpha',new:'z'}],['sec-1'],{effectiveOn:'2026-04-01'})],[section(1,'alpha')]);const r=asOf(p,'2026-04-01');expect(r.unapplied[0]?.reason).toBe('amendment_unapplied');expect(r.taints[0]?.sectionId).toBe('sec-1');});
