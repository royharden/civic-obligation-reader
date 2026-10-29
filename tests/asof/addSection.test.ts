import {it,expect} from 'vitest';
import {applyAmendment} from '../../src/core/apply';
import {amendment,section} from './helpers';
it('OP-ADD: adds after live anchor, otherwise appends',()=>{for(const afterSectionId of ['sec-1','sec-9']){const result=applyAmendment([section(1),section(2)],amendment('A',[{op:'addSection',afterSectionId,section:section(3)}],['sec-3']));expect(result).toEqual({ok:true,sections:afterSectionId==='sec-1'?[section(1),section(3),section(2)]:[section(1),section(2),section(3)]});}});
it('ADD-DUPLICATE: cannot overwrite an existing section',()=>{expect(applyAmendment([section(1)],amendment('A',[{op:'addSection',afterSectionId:'sec-1',section:section(1)}])).ok).toBe(false);});
