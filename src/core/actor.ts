import type { Field, Packet, Resolution, Span } from './types';
import type { ActorValue } from './row';
import type { Clause } from './clauses';
import type { Trigger } from './candidates';
import { isPassivePredicate } from './candidates';
import { definitions } from './depgraph';
import { known, normKey, unknown } from './row';
export interface ActorParse {field:Field<ActorValue>;definitionSectionId?:string}
/** Bounded syntax cues for fronted circumstances, not a semantic noun/role classifier. */
function frontedSubjectStart(prefix:string):number{
 // Phrase markers take a following word, rather than the rest of a hyphenated role head.
 const circumstance=/^\s*(?:(?:about|above|across|after|against|along|amid|among|around|at|before|behind|below|beneath|beside|between|beyond|by|despite|during|except|for|from|if|in|inside|instead of|not later than|on|once|outside|over|prior to|since|subject to|through|throughout|to|toward|under|unless|until|upon|when|where|whereas|while|within|without|with|having)(?=\s)|(?:accordingly|therefore)(?=\s|,))/i;
 // Having inside an explicit subject relative cannot make that subject a fronted absolute.
 const absolute=/^\s*(?:a|an|the|each|every|any|all|no|such)\b(?:(?!\b(?:who|that|which)\b)[^,])*\bhaving\b/i;
 const monthDay=/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2}$/i;
 let start=0;
 while(circumstance.test(prefix.slice(start))||absolute.test(prefix.slice(start))){
  const rest=prefix.slice(start);
  // The date's comma belongs to its phrase; only its following separator can end fronting.
  const separator=[...rest.matchAll(/,/g)].find(m=>!(monthDay.test(rest.slice(0,m.index))&&/^\s*[0-9]{4}(?:\s*,|\s*$)/.test(rest.slice(m.index+1))));
  if(!separator)break;
  start+=separator.index+1;
 }
 return start;
}
/** Subject NP after any fronted comma phrase. Coordinated subject carry-over is explicit. */
export function actor(clause:Clause,trigger:Trigger,resolution:Resolution,packet:Packet,previous?:ActorParse):ActorParse{
 const localEnd=trigger.localStart;let prefix=clause.text.slice(0,localEnd),start=0;
 if(/(?:^|\s)and\s*$/i.test(prefix)&&previous)return previous;
 // No-subject trigger text includes the subject; apply the same NP boundaries to it.
 if(trigger.text.toLowerCase().startsWith('no ')){const no=/^No\s+(.+?)\s+(?:shall|may|must)$/i.exec(trigger.text);if(no){prefix=no[1]!;start=trigger.localStart+trigger.text.indexOf(prefix);}}
 // Once a nominal subject starts, a determiner-led appositive never replaces it.
 const subjectStart=frontedSubjectStart(prefix);
 start+=subjectStart;prefix=prefix.slice(subjectStart);
 const comma=prefix.indexOf(',');if(comma>=0&&!/^\s*(?:and|or)\b/i.test(prefix.slice(comma+1)))prefix=prefix.slice(0,comma);
 // A distinct second subject after '; and' starts at the coordination boundary.
 const coordination=prefix.lastIndexOf('; and ');if(coordination>=0){start+=coordination+6;prefix=prefix.slice(coordination+6);}
 const relative=/\s+(?:who|that|which)\b/i.exec(prefix);if(relative)prefix=prefix.slice(0,relative.index);
 prefix=prefix.replace(/\s+$/,'');const leading=/^\s*/.exec(prefix)![0].length;start+=leading;prefix=prefix.slice(leading);
 const predicate=clause.text.slice(trigger.localEnd);if(isPassivePredicate(predicate)){
  const agent=/\bby\s+(.+?)(?=\s+(?:within|before|on or before|not later than|annually)\b|[,;.]|$)/i.exec(predicate);
  if(!agent||/^(?:[0-9]|January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(agent[1]!))return {field:unknown('actor_unstated')};
  prefix=agent[1]!.trimEnd();start=trigger.localEnd+agent.index+agent[0].indexOf(agent[1]!);
 }
 if(!prefix)return {field:unknown('actor_unstated')};
 if(/\b(?:and|or)\b/i.test(prefix)||/^(?:Each|Either|It|They|Such person|The same)$/i.test(prefix))return {field:unknown('actor_ambiguous')};
 const span:Span=[clause.span[0]+start,clause.span[0]+start+prefix.length],subject=normKey(prefix).replace(/^(?:each|every|any|all|no|such) /,'');
 const defs=definitions(resolution.provisions);const definition=[...defs.values()].reverse().find(d=>[normKey(d.term),normKey(d.term)+'s',normKey(d.term)+'es'].includes(subject));
 if(definition){const defining=resolution.provisions.find(p=>p.sectionId===definition.sectionId);if(defining?.tainted)return {field:unknown('dependency_tainted'),definitionSectionId:definition.sectionId};return {field:known({id:normKey(definition.term),raw:prefix},span),definitionSectionId:definition.sectionId};}
 const allText=[...packet.enactment.sections.map(s=>s.text),...packet.enactment.amendments.flatMap(a=>a.operations==='unstructured'?[]:a.operations.flatMap(op=>op.op==='addSection'?[op.section.text]:op.op==='replaceText'?[op.old,op.new]:op.op==='insertAfter'?[op.text]:[]))].join('\n');
 const definedElsewhere=[...allText.matchAll(/"([^"]+)"\s+means\b/gi)].some(m=>{const t=normKey(m[1]!);return [t,t+'s',t+'es'].includes(subject);});
 return {field:definedElsewhere?unknown('actor_undefined'):known({id:normKey(prefix),raw:prefix},span)};
}
