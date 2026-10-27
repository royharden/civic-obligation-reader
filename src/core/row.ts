import type { Field, Reason, Span } from './types';
export type Modality = 'must'|'must_not'|'may'|'need_not';
export interface ActorValue {id:string;raw:string}
export interface ActionValue {predicateSpan:Span;headVerb:string}
export interface DeadlineValue {kind:'absolute'|'relative_calendar_days'|'before_event'|'none_stated';n?:number;unit?:'calendar_days';anchorText?:string;eventKey?:string;date?:string;dueDate:string|null}
export type RunKind = 'authored_replay'|'captured_replay'|'measured';
export interface Evidence {quote:'exact'|'invalid';version:'in_force'|'not_in_force'|'unknown';references:'resolved'|'unknown';interpretation:'rule'|'model_proposed'|'unknown'}
export type Review = 'unreviewed'|'confirmed'|'wrong'|'unclear'|'stale';
export interface ObligationRow {
 rowId:string;pairKey:string;query:{enactmentId:string;asOf:string;triggerDates:Record<string,string>};stateId:string|null;stateHash:string;sectionId:string;subdivision:string;clauseSpan:Span;clauseText:string;clauseHash:string;dependencyHashes:string[];
 taintKey:string;triggerInputsHash:string;extractorEdition:string;normalizerEdition:string;
 /** Offset-free rule-source identity, preserved before taint. Legacy/model rows may omit it. */
 triggerText?:string;triggerOrdinal?:number;
 actor:Field<ActorValue>;modality:Field<Modality>;action:Field<ActionValue>;object?:Field<string>;deadline:Field<DeadlineValue>;conditions:string[];exceptions:string[];evidence:Evidence;review:Review;unknowns:Reason[];runKind:RunKind;arm:string;
}
export type Row = ObligationRow;
export const EXTRACTOR_EDITION='s46-extractor-v1';
export const NORMALIZER_EDITION='s46-normalizer-v1';
export function known<T>(value:T,evidenceSpan:Span):Field<T>{return {known:value,evidenceSpan};}
export function unknown<T>(reason:Reason):Field<T>{return {unknown:reason};}
/** Shared rule/model head token normalization; the caller retains the full predicate span. */
export function headVerbOf(predicateText:string):string|null {
 const headText=predicateText.replace(/^,\s*[^,]+,\s*/,''),tokens=[...headText.toLowerCase().matchAll(/[a-z0-9]+/g)];
 return tokens.find(t=>(!t[0].endsWith('ly')||['apply','comply','supply','reply','rely','fly','multiply'].includes(t[0]))&&!['also','only','then','thereafter','forthwith','again'].includes(t[0]))?.[0]??null;
}
export function normKey(text:string):string{return text.toLowerCase().replace(/\s+/g,' ').trim().replace(/[.,;:]+$/,'').trim().replace(/^(?:the|a|an) /,'');}
