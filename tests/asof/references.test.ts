import {it,expect} from 'vitest';
import {asOf} from '../../src/core/asof';
import {references,resolveDependencies,subdivisionText} from '../../src/core/depgraph';
import {sha256} from '../../src/core/hash';
import {amendment,packet,section} from './helpers';

it('REF-LOCAL-ONE-HOP: read subsection (a), not the referring subsection (b)',()=>{
 const text='(a) A vendor need not register a closed cart.\n(b) A vendor shall register except as provided in subsection (a).';
 const p=packet([],[section(1,text)]),r=asOf(p,'2026-02-01');
 const clause='A vendor shall register except as provided in subsection (a).';
 const result=resolveDependencies(r,'sec-1',references(clause,'sec-1','(b)'),p,clause,'(b)');
 expect(result).toEqual({sectionIds:['sec-1'],dependencyHashes:[sha256(text)],reason:null});
});

it('REF-RELATIVE-PARAGRAPH: paragraph resolves under originating subsection, not first matching number',()=>{
 const text='(a) Other conditions.\n(1) See Sec. 9.\n(b) Vendor conditions.\n(1) A vendor need not register a closed cart.\n(2) A vendor shall register except as provided in paragraph (1).';
 const clause='A vendor shall register except as provided in paragraph (1).';
 const p=packet([],[section(1,text)]),r=asOf(p,'2026-02-01');
 const refs=references(clause,'sec-1','(b)(2)');expect(refs[0]?.subdivision).toBe('(b)(1)');
 expect(resolveDependencies(r,'sec-1',refs,p,clause,'(b)(2)').reason).toBeNull();
 expect(subdivisionText(text,'(b)(1)')).toBe('(1) A vendor need not register a closed cart.\n');
});

it('REF-TARGET-SUBDIVISION: unrelated sibling references never become outgoing edges',()=>{
 const clause='A vendor shall register except as provided in Sec. 2(a)(1).';
 const text='(a) Conditions.\n(1) A vendor need not register a closed cart.\n(2) See Sec. 3.\n(b) See Sec. 4.';
 const p=packet([],[section(1,clause),section(2,text)]);
 expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references(clause,'sec-1'),p,clause).reason).toBeNull();
});

it('REF-TARGET-SUBSECTION: subsection target includes all of its own paragraphs',()=>{
 const clause='See Sec. 2(a).';const p=packet([],[section(1,clause),section(2,'(a) Conditions.\n(1) See Sec. 3.\n(b) No conditions.')]);
 expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references(clause,'sec-1'),p).reason).toBe('reference_depth');
});

it('REF-MULTIPLE-SUBDIVISIONS: preserve separate targets sharing a section ID while deduplicating hashes',()=>{
 const clause='See Sec. 2(a) and Sec. 2(c).';const p=packet([],[section(1,clause),section(2,'(a) No conditions.\n(b) Other conditions.')]);
 const result=resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references(clause,'sec-1'),p);
 expect(result.sectionIds).toEqual(['sec-2']);expect(result.dependencyHashes).toHaveLength(1);expect(result.reason).toBe('crossref_unresolved');
});

it('REF-MISSING-SUBDIVISION: missing target does not borrow sibling markers or inline references',()=>{
 for(const text of ['(a) See subsection (b).','(a) Conditions.\n(b) Other conditions.\n(1) A vendor need not register.']){
  const clause='See Sec. 2(a)(1).';const p=packet([],[section(1,clause),section(2,text)]);
  expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references(clause,'sec-1'),p).reason).toBe('crossref_unresolved');
 }
 expect(subdivisionText('(a) See subsection (b).','(b)')).toBeNull();
});

it('REF-RELATIVE-MISSING: relative paragraph needs its own subsection context and target',()=>{
 const text='(a) Conditions.\n(1) A vendor need not register.\n(b) A vendor shall register except as provided in paragraph (1).';
 const clause='A vendor shall register except as provided in paragraph (1).';const p=packet([],[section(1,text)]),r=asOf(p,'2026-02-01');
 for(const origin of ['(b)',''])expect(resolveDependencies(r,'sec-1',references(clause,'sec-1',origin),p,clause,origin).reason).toBe('crossref_unresolved');
});

it('REF-SUBDIVISION-SECOND-HOP: genuine local and cross-section outgoing edges exhaust the hop budget',()=>{
 for(const next of ['subsection (c)','Sec. 2']){
  const text=`(a) A vendor need not register except as provided in ${next}.\n(b) A vendor shall register except as provided in subsection (a).\n(c) No conditions.`;
  const clause='A vendor shall register except as provided in subsection (a).';const p=packet([],[section(1,text),section(2)]);
  expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references(clause,'sec-1','(b)'),p,clause,'(b)').reason).toBe('reference_depth');
 }
});

it('REF-SUBDIVISION-CYCLE: local cycle, target self-cycle and section-level self-cycle fail closed',()=>{
 for(const next of ['subsection (b)','subsection (a)','Sec. 1']){
  const text=`(a) See ${next}.\n(b) See subsection (a).`;const p=packet([],[section(1,text)]);
  expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',references('See subsection (a).','sec-1','(b)'),p,undefined,'(b)').reason).toBe('reference_depth');
 }
 const p=packet([],[section(1,'See Sec. 2.'),section(2,'See Sec. 2.')]);
 expect(resolveDependencies(asOf(p,'2026-02-01'),'sec-1',['sec-2'],p).reason).toBe('reference_depth');
});

it('REF-DEFINITION-DISTINCT: definition dependencies do not traverse unrelated section references',()=>{
 const p=packet([],[section(1,'A vendor shall register.'),section(2,'"vendor" means a seller.\n(a) See Sec. 3.')]);const r=asOf(p,'2026-02-01');
 const definition={kind:'definition' as const,sectionId:'sec-2'};
 expect(resolveDependencies(r,'sec-1',[definition],p)).toEqual({sectionIds:['sec-2'],dependencyHashes:[sha256(r.provisions[1]!.text)],reason:null});
 expect(resolveDependencies(r,'sec-1',[definition,...references('See Sec. 2.','sec-1')],p).reason).toBe('reference_depth');
 const dirty=packet([amendment('A','unstructured',['sec-2'])],p.enactment.sections);
 expect(resolveDependencies(asOf(dirty,'2026-03-01'),'sec-1',[definition],dirty).reason).toBe('dependency_tainted');
});

it('REF-PRECEDENCE-TAINT: taint beats missing, independently of target ID or input order',()=>{
 for(const dirtyId of [2,3]){
  const missingId=dirtyId===2?3:2;const p=packet([amendment('A','unstructured',[`sec-${dirtyId}`])],[section(1),section(dirtyId)]),r=asOf(p,'2026-03-01');
  for(const ids of [[dirtyId,missingId],[missingId,dirtyId]])expect(resolveDependencies(r,'sec-1',ids.map(id=>`sec-${id}`),p).reason).toBe('dependency_tainted');
 }
});

it('REF-PRECEDENCE-REPEAL: repealed beats depth, independently of target ID or input order',()=>{
 for(const repealedId of [2,3]){
  const depthId=repealedId===2?3:2;const p=packet([amendment('A',[{op:'repealSection',sectionId:`sec-${repealedId}`}],[`sec-${repealedId}`])],[section(1),section(repealedId),section(depthId,'See Sec. 9.')]),r=asOf(p,'2026-03-01');
  for(const ids of [[repealedId,depthId],[depthId,repealedId]])expect(resolveDependencies(r,'sec-1',ids.map(id=>`sec-${id}`),p).reason).toBe('crossref_repealed');
 }
});

it('REF-PRECEDENCE-MISSING: unresolved beats depth, independently of target ID or input order',()=>{
 for(const missingId of [2,3]){
  const depthId=missingId===2?3:2;const p=packet([],[section(1),section(depthId,'See Sec. 9.')]),r=asOf(p,'2026-02-01');
  for(const ids of [[missingId,depthId],[depthId,missingId]])expect(resolveDependencies(r,'sec-1',ids.map(id=>`sec-${id}`),p).reason).toBe('crossref_unresolved');
 }
});

it('REF-PRECEDENCE-ALL: taint > repeal > unresolved > depth with explicit subdivisions',()=>{
 const p=packet([amendment('A','unstructured',['sec-5']),amendment('B',[{op:'repealSection',sectionId:'sec-4'}],['sec-4'])],[section(1),section(2,'(a) See Sec. 9.'),section(4),section(5,'(a) Conditions.')]);
 const r=asOf(p,'2026-03-01'),deps=references('Sec. 2(a), Sec. 3(a), Sec. 4(a), Sec. 5(a).','sec-1');
 for(const ordered of [deps,[...deps].reverse()])expect(resolveDependencies(r,'sec-1',ordered,p).reason).toBe('dependency_tainted');
 expect(resolveDependencies(r,'sec-1',deps.slice(0,3),p).reason).toBe('crossref_repealed');
 expect(resolveDependencies(r,'sec-1',deps.slice(0,2),p).reason).toBe('crossref_unresolved');
 expect(resolveDependencies(r,'sec-1',deps.slice(0,1),p).reason).toBe('reference_depth');
});
