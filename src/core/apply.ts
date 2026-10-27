import type { Amendment, Section } from './types';
import { sha256 } from './hash';
import { assertNever } from './assert-never';
export type ApplyResult={ok:true;sections:Section[]}|{ok:false;detail:string};
/** Atomic on a private copy. Every supplied preimage is measured before this amendment. */
export function applyAmendment(sections:readonly Section[],amendment:Amendment):ApplyResult {
 if(amendment.operations==='unstructured')return {ok:false,detail:'unstructured'};
 const before=new Map(sections.map(s=>[s.sectionId,s.text]));let draft=sections.map(s=>({...s}));
 const fail=(detail:string):ApplyResult=>({ok:false,detail});
 for(const op of amendment.operations){
 if(op.op==='addSection'){if(draft.some(s=>s.sectionId===op.section.sectionId))return fail('section already present');const at=draft.findIndex(s=>s.sectionId===op.afterSectionId);draft.splice(at<0?draft.length:at+1,0,{...op.section});continue;}
 const at=draft.findIndex(s=>s.sectionId===op.sectionId);if(at<0)return fail('section absent');const section=draft[at]!;
 if(op.preimageSha256!==undefined){const original=before.get(op.sectionId);if(original===undefined||sha256(original)!==op.preimageSha256)return fail('preimage mismatch');}
 switch(op.op){case 'replaceText':case 'insertAfter':{
 const needle=op.op==='replaceText'?op.old:op.anchor;const index=section.text.indexOf(needle);
 if(needle.length===0||index<0||section.text.indexOf(needle,index+1)!==-1)return fail('anchor must occur exactly once');
 section.text=op.op==='replaceText'?section.text.slice(0,index)+op.new+section.text.slice(index+needle.length):section.text.slice(0,index+needle.length)+op.text+section.text.slice(index+needle.length);break;}
 case 'repealSection':draft=draft.filter(s=>s.sectionId!==op.sectionId);break;
 default:return assertNever(op);}
 }
 return {ok:true,sections:draft};
}
