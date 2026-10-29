import {it,expect} from 'vitest';
import {applyAmendment} from '../../src/core/apply';
import {amendment,section} from './helpers';
it('OP-INSERT: inserts verbatim immediately at anchor end',()=>{expect(applyAmendment([section(1,'alpha beta')],amendment('A',[{op:'insertAfter',sectionId:'sec-1',anchor:'alpha',text:'\n😀'}]))).toEqual({ok:true,sections:[section(1,'alpha\n😀 beta')]});});
it('INSERT-AMBIGUOUS: repeated anchor fails without mutation',()=>{expect(applyAmendment([section(1,'a a')],amendment('A',[{op:'insertAfter',sectionId:'sec-1',anchor:'a',text:'x'}])).ok).toBe(false);});
