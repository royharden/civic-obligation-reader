import {describe,it,expect} from 'vitest';
import {applyAmendment} from '../../src/core/apply';
import {sha256} from '../../src/core/hash';
import {amendment,section} from './helpers';
describe('replaceText (authored, not executed)',()=>{
 it('OP-REPLACE: replaces exact text without whitespace folding',()=>{expect(applyAmendment([section(1,'a\r\nb')],amendment('A',[{op:'replaceText',sectionId:'sec-1',old:'\r\n',new:'  '}]))).toEqual({ok:true,sections:[section(1,'a  b')]});});
 it('PREIMAGE-BASE: multiple ops use the pre-amendment full text',()=>{const hash=sha256('alpha beta');expect(applyAmendment([section(1,'alpha beta')],amendment('A',[{op:'replaceText',sectionId:'sec-1',old:'alpha',new:'gamma',preimageSha256:hash},{op:'replaceText',sectionId:'sec-1',old:'beta',new:'delta',preimageSha256:hash}]))).toEqual({ok:true,sections:[section(1,'gamma delta')]});});
 it('ATOMIC-ROLLBACK: later preimage failure rolls back all edits',()=>{const original=[section(1,'alpha beta')];const result=applyAmendment(original,amendment('A',[{op:'replaceText',sectionId:'sec-1',old:'alpha',new:'gamma'},{op:'repealSection',sectionId:'sec-1',preimageSha256:'0'.repeat(64)}]));expect(result.ok).toBe(false);expect(original).toEqual([section(1,'alpha beta')]);});
 it('ANCHOR-OVERLAP: overlapping matches are ambiguous',()=>{expect(applyAmendment([section(1,'aaa')],amendment('A',[{op:'replaceText',sectionId:'sec-1',old:'aa',new:'x'}])).ok).toBe(false);});
 it('ANCHOR-MISSING: empty or absent old fails',()=>{for(const old of ['', 'absent'])expect(applyAmendment([section(1)],amendment('A',[{op:'replaceText',sectionId:'sec-1',old,new:'x'}])).ok).toBe(false);});
});
