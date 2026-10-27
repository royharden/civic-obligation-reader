import type { Field, Packet, Reason, Resolution, Span } from './types';
import type { ActionValue, ObligationRow } from './row';
import { EXTRACTOR_EDITION, NORMALIZER_EDITION, headVerbOf, known, normKey, unknown } from './row';
import { asOf } from './asof';
import { clauses } from './clauses';
import { candidate } from './candidates';
import type { ClauseDisposition, Trigger } from './candidates';
import { actor } from './actor';
import type { ActorParse } from './actor';
import { modality } from './modality';
import { conditionStart, deadline } from './deadline';
import { references, resolveDependencies } from './depgraph';
import type { Dependency } from './depgraph';
import { sha256 } from './hash';
import { canonicalJSON } from './canonical-json';
import { taintKey } from './taint';
import { verifyQuote } from './verify';
import { evidence } from './evidence';

export function inventory(packet:Packet,date:string):ClauseDisposition[]{return asOf(packet,date).provisions.flatMap(p=>clauses(p).map(candidate));}
function dependency(packet:Packet,resolution:Resolution,own:string,text:string,ownSubdivision='',definitionSectionId?:string):{ids:string[];hashes:string[];reason:Reason|null}{
 const dependencies:Dependency[]=references(text,own,ownSubdivision);if(definitionSectionId)dependencies.push({kind:'definition',sectionId:definitionSectionId});
 const result=resolveDependencies(resolution,own,dependencies,packet,text,ownSubdivision);return {ids:result.sectionIds,hashes:result.dependencyHashes,reason:result.reason};
}
function actionField(clause:ClauseDisposition,trigger:Trigger,next:Trigger|undefined,deadlineStart:number|null):Field<ActionValue>{
 let start=trigger.localEnd;while(/\s/.test(clause.text[start]??'')&&start<clause.text.length)start++;let end=clause.text.length;
 if(next){const between=clause.text.slice(start,next.localStart);const boundary=/(?:;\s*and\s+|\s+and\s+)(?:[^;]*?)$/i.exec(between);end=boundary?start+boundary.index:next.localStart;}
 if(deadlineStart!==null&&deadlineStart>=clause.span[0]+start)end=Math.min(end,deadlineStart-clause.span[0]);
 const condition=conditionStart(clause.text.slice(start,end));if(condition!==null)end=start+condition;
 while(end>start&&/[\s,;:.]/.test(clause.text[end-1]!))end--;
 const verb=headVerbOf(clause.text.slice(start,end));
 if(!verb||end<=start)return unknown('actor_unstated');
 const predicateSpan:Span=[clause.span[0]+start,clause.span[0]+end];return known({predicateSpan,headVerb:verb},predicateSpan);
}
export function extractResolution(packet:Packet,resolution:Resolution,triggerDates:Record<string,string>={},arm='B0'):ObligationRow[]{
 if(resolution.status==='not_in_force')return [];
 const rows:ObligationRow[]=[],ordinals=new Map<string,number>();const dispositions=resolution.provisions.flatMap(p=>clauses(p).map(candidate));
 if(dispositions.filter(c=>c.kind!=='not_candidate').length>30)throw new RangeError('More than 30 candidate clauses in one query');const candidates=dispositions.filter(c=>c.kind==='obligation');
 for(const clause of candidates){const provision=resolution.provisions.find(p=>p.sectionId===clause.sectionId)!;let previous:ActorParse|undefined;
  for(let i=0;i<clause.triggers.length;i++){
   const trigger=clause.triggers[i]!,next=clause.triggers[i+1];
   // Source trigger identity survives field taint and needs no offsets for two-date grouping.
   const triggerText=trigger.text.toLowerCase(),group=canonicalJSON([clause.sectionId,clause.subdivision,triggerText]),ordinal=ordinals.get(group)??0;ordinals.set(group,ordinal+1);
   const actorResult=actor(clause,trigger,resolution,packet,previous);previous=actorResult;
   // Bound time language to this trigger's predicate plus a fronted deadline, retaining original offsets.
   let deadlineText=clause.text.slice(0,next?.localStart??clause.text.length);const comma=deadlineText.slice(0,trigger.localStart).lastIndexOf(',');
   const fronted=comma>=0&&/^(?:within|not later than|on or before|by|before)\b/i.test(deadlineText);
   if(!fronted)deadlineText=' '.repeat(trigger.localEnd)+deadlineText.slice(trigger.localEnd);
   const deadlineResult=deadline(deadlineText,clause.span,triggerDates,provision.text.slice(0,clause.span[0]));let af=actorResult.field,mf=modality(trigger),action=actionField(clause,trigger,next,deadlineResult.start),df=deadlineResult.field;
   const deadlineSpan:Span|null='known'in df&&df.known.kind!=='none_stated'?df.evidenceSpan:deadlineResult.start===null?null:[deadlineResult.start,clause.span[1]];
   const fieldParts={actor:'known'in af?provision.text.slice(...af.evidenceSpan):'',action:'known'in action?provision.text.slice(...action.evidenceSpan):'',deadline:deadlineSpan?provision.text.slice(...deadlineSpan):''};
   // Clause-level exceptions belong to modality; refs in actor/action/deadline belong only to that field.
   const clauseReferences=references(clause.text,clause.sectionId,clause.subdivision);const ownedSpans=[af,action].flatMap(v=>'known'in v?[v.evidenceSpan]:[]);if(deadlineSpan)ownedSpans.push(deadlineSpan);
   const modalityRefs=clauseReferences.filter(r=>!ownedSpans.some(s=>r.start+clause.span[0]>=s[0]&&r.end+clause.span[0]<=s[1]));
   const deps={actor:dependency(packet,resolution,clause.sectionId,fieldParts.actor,clause.subdivision,actorResult.definitionSectionId),action:dependency(packet,resolution,clause.sectionId,fieldParts.action,clause.subdivision),deadline:dependency(packet,resolution,clause.sectionId,fieldParts.deadline,clause.subdivision),modality:dependency(packet,resolution,clause.sectionId,modalityRefs.map(r=>clause.text.slice(r.start,r.end)).join('; '),clause.subdivision)};
   if(deps.actor.reason)af=unknown(deps.actor.reason);if(deps.action.reason)action=unknown(deps.action.reason);if(deps.deadline.reason)df=unknown(deps.deadline.reason);if(deps.modality.reason)mf=unknown(deps.modality.reason);
   if(provision.tainted){af=unknown(provision.tainted);mf=unknown(provision.tainted);action=unknown(provision.tainted);df=unknown(provision.tainted);}
   const depIds=[...new Set(Object.values(deps).flatMap(d=>d.ids))].sort(),dependencyHashes=[...new Set(Object.values(deps).flatMap(d=>d.hashes))].sort();
   const unknowns=[...new Set([af,mf,action,df].flatMap(f=>'unknown'in f?[f.unknown]:[]))];
   const usedTriggers='known'in df&&df.known.eventKey&&triggerDates[df.known.eventKey]?{[df.known.eventKey]:triggerDates[df.known.eventKey]}:{};
   const quote=verifyQuote(provision.text,...clause.span,clause.text).quote,versionTainted=!!provision.tainted||unknowns.includes('dependency_tainted');
   rows.push({rowId:sha256(canonicalJSON([packet.enactment.id,resolution.stateId,clause.sectionId,clause.span,trigger.span[0]])),pairKey:sha256(canonicalJSON([packet.enactment.id,clause.sectionId,clause.subdivision,triggerText,ordinal])),triggerText,triggerOrdinal:ordinal,query:{enactmentId:packet.enactment.id,asOf:resolution.asOf,triggerDates:{...triggerDates}},stateId:resolution.stateId,stateHash:resolution.stateHash,sectionId:clause.sectionId,subdivision:clause.subdivision,clauseSpan:clause.span,clauseText:clause.text,clauseHash:sha256(clause.text),dependencyHashes,taintKey:taintKey(resolution.taints,[clause.sectionId,...depIds]),triggerInputsHash:Object.keys(usedTriggers).length?sha256(canonicalJSON(usedTriggers)):'',extractorEdition:EXTRACTOR_EDITION,normalizerEdition:NORMALIZER_EDITION,actor:af,modality:mf,action,deadline:df,conditions:[...clause.text.matchAll(/(?:,?\s+)(?:if|unless|when|provided that)\s+[^;.]+/gi)].map(m=>m[0].trim()),exceptions:[...clause.text.matchAll(/(?:except as provided in|subject to)\s+Sec\.\s+\d+(?:\([a-z]\))?(?:\(\d+\))?/gi)].map(m=>m[0]),evidence:evidence(quote,versionTainted,Object.values(deps).some(d=>d.reason!==null)),review:'unreviewed',unknowns,runKind:'measured',arm});
  }
 }return rows;
}
export function extract(packet:Packet,date:string,triggerDates:Record<string,string>={},arm='B0'):ObligationRow[]{return extractResolution(packet,asOf(packet,date),triggerDates,arm);}
