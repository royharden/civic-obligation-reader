import { describe,it,expect } from 'vitest';
import type { ObligationRow } from '../../src/core/row';
import type { GoldLine } from '../../eval/score';
import { score, tokenF1 } from '../../eval/score';
import { align } from '../../eval/align';
import { bootstrap } from '../../eval/bootstrap';
function row():ObligationRow{return {rowId:'row1',pairKey:'pair1',query:{enactmentId:'X01',asOf:'2026-04-01',triggerDates:{}},stateId:'S1',stateHash:'state1',sectionId:'sec-1',subdivision:'',clauseSpan:[0,31],clauseText:'A vendor shall hold the permit.',clauseHash:'clause1',dependencyHashes:[],taintKey:'',triggerInputsHash:'',extractorEdition:'test',normalizerEdition:'test',actor:{known:{id:'vendor',raw:'A vendor'},evidenceSpan:[0,8]},modality:{known:'must',evidenceSpan:[9,14]},action:{known:{predicateSpan:[15,30],headVerb:'hold'},evidenceSpan:[15,30]},deadline:{known:{kind:'none_stated',dueDate:null},evidenceSpan:[0,31]},conditions:[],exceptions:[],evidence:{quote:'exact',version:'in_force',references:'resolved',interpretation:'rule'},review:'unreviewed',unknowns:[],runKind:'measured',arm:'B0'};}
function gold(p=row()):GoldLine{return {goldSchemaVersion:'s46.gold.v1',split:'dev',provenance:'dev-builder-authored',labeller:'test',enactmentId:p.query.enactmentId,queryId:`${p.query.enactmentId}@${p.query.asOf}`,asOf:p.query.asOf,stateId:p.stateId,triggerDates:{},slotId:'X01/sec-1/1',kind:'obligation',sectionId:p.sectionId,subdivision:p.subdivision,clauseSpan:p.clauseSpan,clauseText:p.clauseText,actor:p.actor,modality:p.modality,action:p.action,deadline:p.deadline,traps:[],contested:false};}
describe('scoring regressions (authored, not executed)',()=>{
 it('M4-EXACT-SPAN: identical predicate spans match exactly despite different headVerb, while relaxed action fails',()=>{ // what_bug_this_catches: exact-span accuracy incorrectly includes headVerb equality.
  const p=row(),g=gold(p);if('known'in p.action)p.action={...p.action,known:{...p.action.known,headVerb:'post'}};
  const s=score([g],[p]);expect(s.exactActionAccuracy).toBe(1);expect(s.secondary).toMatchObject({tp:0,fp:1,fn:1});expect(s.actionFidelity).toBe(1);expect(s.tuple.f1).toBe(1);
 });
 it('M4-EXACT-DIFFERENT-SPANS: different predicate spans never count as exact',()=>{ // what_bug_this_catches: equal head verbs or overlapping predicate words are treated as exact spans.
  const p=row(),g=gold(p);p.action={known:{predicateSpan:[15,29],headVerb:'hold'},evidenceSpan:[15,29]};expect(score([g],[p]).exactActionAccuracy).toBe(0);
 });
 it('M4-EXACT-UNKNOWN: exact unknown actions retain reason equality separately from fidelity',()=>{ // what_bug_this_catches: changing the known-span rule silently changes the established unknown-action convention.
  const p=row(),g=gold(p);g.action={unknown:'actor_unstated'};p.action={unknown:'actor_unstated'};expect(score([g],[p]).exactActionAccuracy).toBe(1);
  p.action={unknown:'dependency_tainted'};const s=score([g],[p]);expect(s.exactActionAccuracy).toBe(0);expect(s.actionFidelity).toBe(1);
 });
 it('M4-EXACT-CONTESTED: action/kind contests still exclude exact-action contributions',()=>{ // what_bug_this_catches: the new exact-span helper bypasses action/kind denominator exclusions.
  for(const field of ['action','kind'] as const){const p=row(),g=gold(p),s=score([g],[p],{contested:[{queryId:g.queryId,slotId:g.slotId,field}]});expect(s.exactActionAccuracy).toBe(0);expect(s.excluded.actionSlots).toBe(1);expect(s.secondary).toMatchObject({tp:0,fp:0,fn:0});}
 });
 it('uses global one-to-one IoU assignment rather than a greedy best edge',()=>{ // what_bug_this_catches: one high-IoU edge consumes the only possible match for another gold slot.
  const result=align([{sectionId:'sec-1',clauseSpan:[0,100]},{sectionId:'sec-1',clauseSpan:[0,60]}],[{sectionId:'sec-1',clauseSpan:[0,80]},{sectionId:'sec-1',clauseSpan:[30,100]}]);expect(result.pairs.map(p=>[p.gold,p.prediction])).toEqual([[0,1],[1,0]]);
 });
 it('requires actor/modality/deadline and an exact in-force quote for a tuple TP',()=>{ // what_bug_this_catches: exact quotes treated as proof of semantic field correctness.
  const p=row(),g=gold(p);expect(score([g],[p]).tuple.f1).toBe(1);const wrong={...p,modality:{known:'may' as const,evidenceSpan:[9,14] as [number,number]}};expect(score([g],[wrong]).tuple).toMatchObject({tp:0,fp:1,fn:1});expect(score([g],[{...p,evidence:{...p.evidence,quote:'invalid'}}]).tuple.tp).toBe(0);
 });
 it('excludes contested actor from tuple and actor accuracy but retains action and slot recall',()=>{ // what_bug_this_catches: disputed semantic fields become false positives or suppress undisputed metrics.
  const p=row(),g=gold(p),s=score([g],[p],{contested:[{queryId:g.queryId,slotId:g.slotId,field:'actor'}]});expect(s.tuple).toMatchObject({tp:0,fp:0,fn:0});expect(s.fields.actor.total).toBe(0);expect(s.actionFidelity).toBe(1);expect(s.slotRecall).toBe(1);expect(s.excluded.tuplePredictions).toBe(1);
 });
 it('removes contested kind from EVERY metric and wrong-version denominator',()=>{ // what_bug_this_catches: kind disputes remain in the wrong-version query or assertion denominator (r6 N1).
  const p=row(),g=gold(p),s=score([g],[p],{contested:[{queryId:g.queryId,slotId:g.slotId,field:'kind'}]});expect(s.tuple).toMatchObject({tp:0,fp:0,fn:0});expect(s.wrongVersion).toMatchObject({assertions:0,queries:0,wrongAssertions:0});expect(s.coverage.fields).toBe(0);expect(s.fields.action.total).toBe(0);expect(s.actionFidelity).toBe(0);expect(s.slotRecall).toBe(0);
 });
 it('keeps contested action out of co-primary and secondary action metrics',()=>{ // what_bug_this_catches: secondary 4-tuple scores use disputed actions despite primary exclusion rules.
  const p=row(),g=gold(p),s=score([g],[p],{contested:[{queryId:g.queryId,slotId:g.slotId,field:'action'}]});expect(s.tuple.f1).toBe(1);expect(s.secondary).toMatchObject({tp:0,fp:0,fn:0});expect(s.fields.action.total).toBe(0);expect(s.excluded.actionSlots).toBe(1);
 });
 it('wrong-version (b) detects stale values with unchanged quote and stable slot; disputed references cannot establish it',()=>{ // what_bug_this_catches: unchanged quote masks a removed definition; contested old-state gold used as evidence.
  const p=row(),g=gold(p);g.actor={unknown:'actor_undefined'};const old={...gold(p),queryId:'X01@2026-02-01',asOf:'2026-02-01',stateId:'S0'};expect(score([g],[p],{allGold:[g,old]}).wrongVersion.wrongAssertions).toBe(1);expect(score([g],[p],{allGold:[g,old],contested:[{queryId:old.queryId,slotId:old.slotId,field:'kind'}]}).wrongVersion.wrongAssertions).toBe(0);
 });
 it('wrong-version (a) detects exact text confined to another state, and no_rows queries reject all assertions',()=>{ // what_bug_this_catches: version scorer relies only on field equality or ignores not-in-force assertions.
  const p=row(),g=gold(p);const s=score([g],[p],{stateTexts:{'X01/S1/sec-1':'A vendor shall post the permit.','X01/S0/sec-1':p.clauseText}});expect(s.wrongVersion).toMatchObject({wrongAssertions:1,wrongQueries:1});const noRows:GoldLine={...g,kind:'no_rows',stateId:null,slotId:'X01/none/0'};expect(score([noRows],[p]).wrongVersion.wrongAssertions).toBe(1);
 });
 it('unknown precision/recall, known coverage and unmatched slots remain visible',()=>{ // what_bug_this_catches: abstention improves tuple by removing slots or unknown predictions disappear from precision.
  const p=row(),g=gold(p);g.actor={unknown:'actor_unstated'};p.actor={unknown:'actor_unstated'};const s=score([g],[p]);expect(s.unknown.precision).toBe(1);expect(s.unknown.recall).toBe(1);expect(s.coverage.rate).toBe(0.75);expect(score([g],[]).slotRecall).toBe(0);expect(score([g],[]).unknown.fn).toBe(1);
 });
 it('action fidelity uses predicate multiset tokens; resampling uses deterministic query clusters',()=>{ // what_bug_this_catches: action boundary shifts are hidden by set matching and bootstrap samples individual assertions.
  expect(tokenF1('file file form','file form')).toBe(0.8);expect(bootstrap([1,2,3],xs=>xs.reduce((a,b)=>a+b,0)/xs.length,30)).toEqual(bootstrap([1,2,3],xs=>xs.reduce((a,b)=>a+b,0)/xs.length,30));
 });
});
