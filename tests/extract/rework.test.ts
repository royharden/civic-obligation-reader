import {describe,it,expect} from 'vitest';
import {extract,inventory} from '../../src/core/extract';
import {deadline} from '../../src/core/deadline';
import {packet} from './fixtures';
const date='2026-02-01';

describe('M4 High review regressions (authored, not executed)',()=>{
 it('M4-PASSIVE-THINGS: permit/document passives survive candidate filtering with and without an agent',()=>{ // what_bug_this_catches: thing-subject filtering prevents passive actor parsing from running.
  for(const subject of ['The permit','The document'])for(const modal of ['shall','must'])for(const participle of ['filed','held']){
   const withAgent=packet(`${subject} ${modal} be ${participle} by the Clerk.`),withoutAgent=packet(`${subject} ${modal} be ${participle}.`);
   expect(inventory(withAgent,date)[0]?.kind).toBe('obligation');expect(extract(withAgent,date)).toHaveLength(1);
   expect(extract(withAgent,date)[0]?.actor).toMatchObject({known:{id:'clerk',raw:'the Clerk'}});
   expect(extract(withoutAgent,date)).toHaveLength(1);expect(extract(withoutAgent,date)[0]?.actor).toEqual({unknown:'actor_unstated'});
  }
 });
 it('M4-ACTIVE-THINGS: active permit/document subjects and enactment titles remain negative',()=>{ // what_bug_this_catches: fixing passive duties must not turn thing expiration or title clauses into obligations.
  for(const text of ['The permit shall expire before the festival.','The document must remain on the desk.','The permit shall be eligible for renewal.','This ordinance may be cited as the Quillmere Ordinance.']){
   expect(extract(packet(text),date)).toHaveLength(0);expect(inventory(packet(text),date)[0]).toMatchObject({kind:'negative',negativeReason:'non_operative'});
  }
 });
 it('M4-CONDITION-TIME: uncommaed condition-only time cues do not create deadlines',()=>{ // what_bug_this_catches: before/within language inside a condition is mistaken for the duty deadline.
  for(const condition of ['if the hearing occurs before the festival','unless the Clerk responds within ten (10) calendar days after the hearing','when the hearing occurs before the festival','provided that the hearing occurs before the festival']){
   const text=`A vendor shall file a report ${condition}.`,row=extract(packet(text),date)[0]!;
   expect(row.deadline).toEqual({known:{kind:'none_stated',dueDate:null},evidenceSpan:row.clauseSpan});
   expect(row.action).toMatchObject({known:{headVerb:'file'}});if('known'in row.action)expect(text.slice(...row.action.known.predicateSpan)).toBe('file a report');
  }
 });
 it('M4-FRONTED-CONDITION: a time cue in a fronted condition is excluded with offsets preserved',()=>{ // what_bug_this_catches: removing a fronted condition either fabricates a deadline or moves evidence offsets.
  const text='If the hearing occurs before the festival, a vendor shall file a report.',row=extract(packet(text),date)[0]!;
  expect(row.deadline).toEqual({known:{kind:'none_stated',dueDate:null},evidenceSpan:row.clauseSpan});
  expect(deadline(text,[0,text.length]).field).toEqual({known:{kind:'none_stated',dueDate:null},evidenceSpan:[0,text.length]});
  const withDeadline='If the hearing occurs before the festival, a vendor shall file a report within ten (10) calendar days after the hearing.';
  const timed=extract(packet(withDeadline),date)[0]!;expect(timed.deadline).toMatchObject({known:{kind:'relative_calendar_days',n:10,eventKey:'hearing'}});
  if('known'in timed.deadline)expect(withDeadline.slice(...timed.deadline.evidenceSpan)).toBe('within ten (10) calendar days after the hearing');
 });
 it('M4-DEADLINE-CONTROLS: supported and fronted deadlines remain intact before a comma condition',()=>{ // what_bug_this_catches: broad condition removal suppresses real deadlines or alters their source spans.
  for(const suffix of ['.',', if the hearing occurs before the festival.']){
   const text=`A vendor shall file a report within ten (10) calendar days after the hearing${suffix}`,row=extract(packet(text),date,{hearing:'2026-03-01'})[0]!;
   expect(row.deadline).toMatchObject({known:{kind:'relative_calendar_days',n:10,eventKey:'hearing',dueDate:'2026-03-11'}});
   if('known'in row.deadline)expect(text.slice(...row.deadline.evidenceSpan)).toBe('within ten (10) calendar days after the hearing');
  }
  const text='Within ten (10) calendar days after the hearing, a vendor shall file a report.',row=extract(packet(text),date)[0]!;
  expect(row.deadline).toMatchObject({known:{kind:'relative_calendar_days',n:10,eventKey:'hearing'},evidenceSpan:[0,text.indexOf(',')]});
  if('known'in row.action)expect(text.slice(...row.action.known.predicateSpan)).toBe('file a report');
 });
 it('M4-HEAD-PARENTHETICAL: skip the leading parenthetical for headVerb only, keeping the exact predicate',()=>{ // what_bug_this_catches: in/without becomes headVerb or the parenthetical disappears from the action span.
  for(const predicate of [', in writing, notify the Clerk',', without delay, promptly notify the Clerk','promptly notify the Clerk','notify the Clerk']){
   const text=`A vendor shall${predicate.startsWith(',')?'':' '}${predicate}.`,row=extract(packet(text),date)[0]!;
   expect(row.action).toMatchObject({known:{headVerb:'notify'}});if('known'in row.action){expect(text.slice(...row.action.known.predicateSpan)).toBe(predicate);expect(row.action.evidenceSpan).toEqual(row.action.known.predicateSpan);}
  }
 });
});
