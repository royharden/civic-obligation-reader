import type { Field, Span } from './types';
import type { DeadlineValue } from './row';
import { known, normKey, unknown } from './row';
import { addDays, isValidDate } from './dates';
import { parseNumber } from './numwords';
import { assertNever } from './assert-never';
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DATE='(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|(?:'+MONTHS.join('|')+') [0-9]{1,2}, [0-9]{4})';
const DEADLINE_CUE=/\b(?:within|not later than|on or before|before|after|prior to|until|every|annually|monthly|weekly|daily|months?|weeks?|years?|business days?|working days?|holidays?)\b|\bby\s+(?=\d{4}-|January |February |March |April |May |June |July |August |September |October |November |December )/i;
function eventText(text:string):string{let end=text.length;for(let i=0;i<text.length;i++)if(text[i]===','||text[i]===';'||text[i]==='.'&&(i+1===text.length||/\s/.test(text[i+1]!))&&!/Sec$/i.test(text.slice(Math.max(0,i-3),i))){end=i;break;}return text.slice(0,end).trimEnd();}
function dateValue(text:string):string|null{if(isValidDate(text))return text;const m=/^([A-Za-z]+) ([0-9]{1,2}), ([0-9]{4})$/.exec(text);if(!m)return null;const month=MONTHS.findIndex(v=>v.toLowerCase()===m[1]!.toLowerCase())+1;const result=`${m[3]}-${String(month).padStart(2,'0')}-${m[2]!.padStart(2,'0')}`;return isValidDate(result)?result:null;}
export function dueDateOf(value:DeadlineValue,triggerDates:Record<string,string>):string|null{
 switch(value.kind){case 'absolute':return value.date??null;case 'relative_calendar_days':{const trigger=value.eventKey===undefined?undefined:triggerDates[value.eventKey];return trigger&&isValidDate(trigger)&&value.n!==undefined?addDays(trigger,value.n):null;}case 'before_event':case 'none_stated':return null;default:return assertNever(value.kind);}
}
export function normalizeDeadline(value:DeadlineValue,triggerDates:Record<string,string>):DeadlineValue{const normalized={...value,...(value.anchorText===undefined?{}:{eventKey:normKey(value.anchorText)})};return {...normalized,dueDate:dueDateOf(normalized,triggerDates)};}
export interface DeadlineParse {field:Field<DeadlineValue>;/** First deadline cue, section-local; null when none. */ start:number|null}
/** Shared trailing condition/exception boundary for action and deadline search ranges. */
export function conditionStart(text:string):number|null{return /(?:,?\s+(?:if|unless|when|except|provided that|subject to))\b/i.exec(text)?.index??null;}
/** Parse one slot's text (caller bounds it before a coordinated next trigger). */
export function deadline(text:string,span:Span,triggerDates:Record<string,string>={},priorSectionText=''):DeadlineParse{
 // Conditions never create deadlines, with or without a comma. Mask fronted conditions to retain offsets.
 let search=text;const front=/^(?:If|Unless|When)\b[^,]*,\s*/i.exec(search);if(front)search=' '.repeat(front[0].length)+search.slice(front[0].length);
 const condition=conditionStart(search);if(condition!==null)search=search.slice(0,condition);
 const cue=DEADLINE_CUE.exec(search);
 if(!cue)return {field:known({kind:'none_stated',dueDate:null},span),start:null};
 const start=cue.index,tail=search.slice(start).replace(/[.;:]\s*$/,'').trimEnd();let value:DeadlineValue|undefined,end=0;
 const absolute=new RegExp('^(?:by|on or before|not later than) ('+DATE+')','i').exec(tail);
 if(absolute){const date=dateValue(absolute[1]!);if(!date)return {field:unknown('deadline_unsupported'),start:span[0]+start};value={kind:'absolute',date,dueDate:date};end=absolute[0].length;}
 const relative=/^(?:within|not later than) (.+?) calendar days? after (.+)/i.exec(tail);
 if(!value&&relative){const anchorText=eventText(relative[2]!);end=relative[0].indexOf(relative[2]!)+anchorText.length;
  // Unsupported independent phrases outrank conflicting figures (guide 6.4).
  // Timing words inside anchorText are part of that one event, not a second phrase.
  if(DEADLINE_CUE.test(tail.slice(end)))return {field:unknown('deadline_unsupported'),start:span[0]+start};
  const parsed=parseNumber(relative[1]!);if('unknown'in parsed)return {field:unknown(parsed.unknown),start:span[0]+start};if(!anchorText)return {field:unknown('deadline_anchor_unresolved'),start:span[0]+start};value={kind:'relative_calendar_days',n:parsed.n,unit:'calendar_days',anchorText,eventKey:normKey(anchorText),dueDate:null};}
 const before=/^before (.+)/i.exec(tail);
 if(!value&&before){if(new RegExp('^'+DATE,'i').test(before[1]!))return {field:unknown('deadline_unsupported'),start:span[0]+start};const anchorText=eventText(before[1]!);value={kind:'before_event',anchorText,eventKey:normKey(anchorText),dueDate:null};end=7+anchorText.length;}
 if(!value)return {field:unknown('deadline_unsupported'),start:span[0]+start};
 // A second independent deadline is unsupported. Cue words in the EVENT are part of that EVENT.
 if(DEADLINE_CUE.test(tail.slice(end)))return {field:unknown('deadline_unsupported'),start:span[0]+start};
 if(value.anchorText){const deictic=/^(?:such|said|that)\s+(.+)/i.exec(value.anchorText);const antecedent=deictic?priorSectionText.toLowerCase().includes(deictic[1]!.toLowerCase()):true;if(!antecedent||/\b(?:set|fixed|determined|specified) by\b/i.test(value.anchorText))return {field:unknown('deadline_anchor_unresolved'),start:span[0]+start};}
 return {field:known(normalizeDeadline(value,triggerDates),[span[0]+start,span[0]+start+end]),start:span[0]+start};
}
