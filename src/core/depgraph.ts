import type { Packet, Provision, Reason, Resolution } from './types';
import { sha256 } from './hash';
export interface Definition {term:string;sectionId:string;raw:string;start:number;end:number}
export interface Reference {sectionId:string;subdivision:string;start:number;end:number;exception:boolean}
/** A definition is a field dependency, not a request to follow all references in its section. */
export interface DefinitionDependency {kind:'definition';sectionId:string}
export type Dependency = string | Reference | DefinitionDependency;
export interface DependencyResolution {sectionIds:string[];dependencyHashes:string[];reason:Reason|null}
export function normTerm(text:string):string {return text.toLowerCase().replace(/\s+/g,' ').trim().replace(/[.,;:]+$/,'').trim().replace(/^(?:the|an|a) /,'');}
/** Last definition in display/text order wins, using the selected state only. */
export function definitions(provisions:readonly Provision[]):Map<string,Definition> {
 const out=new Map<string,Definition>();for(const p of provisions){const re=/["“]([^"”]+)["”]\s+means\b/gi;for(const m of p.text.matchAll(re)){const term=m[1]!;out.set(normTerm(term),{term,sectionId:p.sectionId,raw:m[0],start:m.index,end:m.index+m[0].length});}}return out;
}
/** Relative paragraphs belong to the originating clause's level-1 subsection. */
export function references(text:string,ownSectionId:string,ownSubdivision=''):Reference[] {
 const out:Reference[]=[];const re=/\bSec\.\s+(\d+)((?:\([a-z]\))?(?:\(\d+\))?)|\b(subsection|paragraph)\s+(\([a-z0-9]+\))/g;
 for(const m of text.matchAll(re)){
  const prefix=text.slice(Math.max(0,m.index-24),m.index);let subdivision=m[2]??m[4]??'';
  if(m[3]==='paragraph')subdivision=(/^\([a-z]\)/.exec(ownSubdivision)?.[0]??'')+subdivision;
  out.push({sectionId:m[1]===undefined?ownSectionId:`sec-${m[1]}`,subdivision,start:m.index,end:m.index+m[0].length,exception:/except as provided in\s*$/i.test(prefix)});
 }return out;
}
/** Only line-start markers establish subdivisions (guide section 2); inline references do not. */
export function subdivisionText(text:string,subdivision:string):string|null {
 if(subdivision==='')return text;if(!/^\([a-z]\)(?:\([1-9]\d?\))?$/.test(subdivision))return null;
 const markers=[...text.matchAll(/(?:^|\n) *(\([a-z]\)|\([1-9]\d?\)) /g)];let alpha='';let start:number|null=null;
 for(const marker of markers){
  const part=marker[1]!;const levelOne=/^\([a-z]\)$/.test(part);if(levelOne)alpha=part;
  const path=levelOne?part:alpha+part;const at=marker.index+(marker[0].startsWith('\n')?1:0);
  if(start!==null&&(levelOne||subdivision!==alpha))return text.slice(start,at);
  if(path===subdivision)start=at;
 }
 return start===null?null:text.slice(start);
}
export function subdivisionExists(text:string,subdivision:string):boolean {return subdivisionText(text,subdivision)!==null;}
/** One direct explicit reference hop, followed by inspection of that exact target only.
 * Legacy string dependencies mean whole-section references; new callers keep Reference targets
 * and mark definition dependencies explicitly. clauseText is retained for signature compatibility;
 * ownSubdivision identifies the source node for cycle detection and relative paragraph parsing.
 * Full section hashes intentionally preserve the legacy dependency/ruling invalidation contract.
 */
export function resolveDependencies(resolution:Resolution,sectionId:string,dependencies:readonly Dependency[],packet?:Packet,_clauseText?:string,ownSubdivision=''):DependencyResolution {
 const byId=new Map(resolution.provisions.map(p=>[p.sectionId,p]));const ids=[...new Set(dependencies.map(dep=>typeof dep==='string'?dep:dep.sectionId))].sort();const hashes:string[]=[];
 const applied=new Set(resolution.trace.filter(step=>step.status==='applied').map(step=>step.amendmentId));const repealed=new Set<string>();for(const a of packet?.enactment.amendments??[])if(applied.has(a.amendmentId)&&a.operations!=='unstructured')for(const op of a.operations)if(op.op==='repealSection')repealed.add(op.sectionId);
 type DependencyReason='dependency_tainted'|'crossref_repealed'|'crossref_unresolved'|'reference_depth';
 const precedence:Record<DependencyReason,number>={dependency_tainted:0,crossref_repealed:1,crossref_unresolved:2,reference_depth:3};
 let reason:DependencyReason|null=null;const choose=(r:DependencyReason):void=>{if(reason===null||precedence[r]<precedence[reason])reason=r;};
 for(const id of ids){const target=byId.get(id);if(target)hashes.push(sha256(target.text));}
 for(const dep of dependencies){
  const id=typeof dep==='string'?dep:dep.sectionId;const target=byId.get(id);
  if(!target){choose(repealed.has(id)?'crossref_repealed':'crossref_unresolved');continue;}
  if(target.tainted!==null){choose('dependency_tainted');continue;}
  if(typeof dep!=='string'&&'kind' in dep)continue;
  const subdivision=typeof dep==='string'?'':dep.subdivision;const targetText=subdivisionText(target.text,subdivision);
  if(targetText===null){choose('crossref_unresolved');continue;}
  const key=(id:string,path:string):string=>`${id}/${path}`;const visited=new Set([key(sectionId,ownSubdivision)]);
  const targetKey=key(id,subdivision);if(visited.has(targetKey)){choose('reference_depth');continue;}visited.add(targetKey);
  // Every outgoing reference would consume a second hop, including a section-level self-cycle.
  if(references(targetText,id,subdivision).length>0)choose('reference_depth');
 }
 return {sectionIds:ids,dependencyHashes:hashes,reason};
}
