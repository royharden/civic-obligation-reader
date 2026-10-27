/** Shared, platform-independent packet and version contracts. */
export const UNKNOWN_REASONS = ['actor_undefined','actor_unstated','actor_ambiguous','deadline_anchor_unresolved','deadline_unsupported','conflicting_figures','crossref_unresolved','crossref_repealed','reference_depth','amendment_unapplied','amendment_conflict','retroactive_unsupported','dependency_tainted','quote_not_found','not_in_force','version_unknown','model_invalid','screen_blocked'] as const;
export type Reason = typeof UNKNOWN_REASONS[number];
export type Span = [number, number];
export type Field<T> = {known:T; evidenceSpan:Span} | {unknown:Reason};
export interface Section {sectionId:string; path:string; heading:string; text:string}
type Target = {sectionId:string; preimageSha256?:string};
export type Operation = (Target & {op:'replaceText'; old:string; new:string}) | (Target & {op:'insertAfter'; anchor:string; text:string}) | (Target & {op:'repealSection'}) | {op:'addSection'; afterSectionId:string; section:Section};
export interface Amendment {amendmentId:string; enactedOn:string; effectiveOn:string; order?:number; instructionText:string; affectedSectionIds:string[]; operations:Operation[]|'unstructured'}
export interface Enactment {id:string; title:string; fictionalProvenance:{author:string;attestation:string;license:'CC0-1.0'}; enactedOn:string;commencesOn:string;sunsetExclusive:string|null;sections:Section[];amendments:Amendment[]}
export interface Packet {schemaVersion:'s46.packet.v1';enactment:Enactment}
export type TaintReason = 'amendment_conflict'|'retroactive_unsupported'|'amendment_unapplied'|'dependency_tainted';
export interface Taint {sectionId:string;reason:TaintReason;amendmentId:string;from:string}
export interface Provision extends Section {tainted:Reason|null}
export interface AmendmentRef {amendmentId:string;enactedOn:string;effectiveOn:string;reason?:TaintReason}
export interface TraceStep {amendmentId:string;effectiveOn:string;status:'applied'|'unapplied';reason?:TaintReason;detail?:string}
export interface Resolution {asOf:string;status:'in_force'|'not_in_force';stateId:string|null;stateHash:string;provisions:Provision[];pending:AmendmentRef[];unapplied:AmendmentRef[];taints:Taint[];trace:TraceStep[]}
export interface StatePeriod {stateId:string;from:string;toExclusive:string|null}
