import type { Span } from './types';
import type { Clause } from './clauses';
import type { Modality } from './row';
export type NegativeReason='definition'|'purpose'|'non_operative'|'injection';
export interface Trigger {span:Span;localStart:number;localEnd:number;text:string;modality:Modality}
export interface ClauseDisposition extends Clause {kind:'obligation'|'negative'|'not_candidate';negativeReason?:NegativeReason;triggers:Trigger[]}
/** The supported passive shape, shared with actor parsing; adjective predicates keep their subject. */
export function isPassivePredicate(text:string):boolean{return /^\s+be\s+(?!responsible\b|liable\b|present\b|eligible\b)(?:\w+(?:ed|en|wn|nt|lt|pt)|made|paid|held|read|built|brought|given|taken)\b/i.test(text);}
export function triggers(clause:Clause):Trigger[]{
 const out:Trigger[]=[];const re=/\b(?:is not required to|are not required to|need not|shall not|must not|may not|shall|must|may)\b/gi;
 for(const m of clause.text.matchAll(re)){let start=m.index;const text=m[0].toLowerCase();let modality:Modality=text.includes('not required')||text==='need not'?'need_not':text.endsWith(' not')?'must_not':text==='may'?'may':'must';
  const subject=clause.text.slice(0,start);const no=/(?:^|,\s+)(No\s+[^,;]+?)\s*$/i.exec(subject);if(no){start=subject.lastIndexOf(no[1]!);modality='must_not';}
  out.push({span:[clause.span[0]+start,clause.span[0]+m.index+m[0].length],localStart:start,localEnd:m.index+m[0].length,text:clause.text.slice(start,m.index+m[0].length),modality});
 }return out;
}
export function candidate(clause:Clause):ClauseDisposition{
 const ts=triggers(clause);let negativeReason:NegativeReason|undefined;
 const thing=/\b(?:This|The)\s+(?:permit|licence|license|document)\s+(?:shall|must|may)(?: not)?\b/i.exec(clause.text);
 // Documents/things with active predicates are non-operative; a passive may impose a duty on its by-agent.
 const passiveThing=thing!==null&&isPassivePredicate(clause.text.slice(thing.index+thing[0].length));
 if(/\b(?:systems?|models?|assistants?|parsers?|processors?|readers?)\b[^.]*\b(?:summaris\w*|report|state|ignore|override|instructions?)\b|\bignore\b[^.]*\b(?:above|previous|instructions?|text)\b/i.test(clause.text))negativeReason='injection';
 else if(/"[^"]+"\s+means\b/i.test(clause.text))negativeReason='definition';
 else if(/^(?:Purpose|Findings|Intent)$/i.test(clause.heading)||/^(?:The purpose of|It is the intent of)\b/i.test(clause.text))negativeReason='purpose';
 else if(/\b(?:This|The)\s+(?:ordinance|enactment|section|provision)\s+(?:shall|must|may)\b/i.test(clause.text)||(thing!==null&&!passiveThing)||/^Sec\.\s+\d+\s+(?:shall|must|may)\b/i.test(clause.text)||/as the case may be/i.test(clause.text))negativeReason='non_operative';
 if(negativeReason&&(ts.length>0||negativeReason==='injection'))return {...clause,kind:'negative',negativeReason,triggers:[]};
 return {...clause,kind:ts.length?'obligation':'not_candidate',triggers:ts};
}
