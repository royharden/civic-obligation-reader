import type { Evidence, ObligationRow } from './row';
export function evidence(quote:'exact'|'invalid',tainted:boolean,unresolved:boolean,model=false):Evidence{return {quote,version:tainted?'unknown':'in_force',references:unresolved?'unknown':'resolved',interpretation:model?'model_proposed':'rule'};}
export function exportDisposition(row:ObligationRow):{status:'unsupported'|'partial'|'cited';verificationScope?:'quote_and_version_only'}{
 if(row.evidence.quote==='invalid'||row.evidence.version==='not_in_force')return {status:'unsupported'};
 if(row.evidence.version==='unknown'||row.evidence.references==='unknown')return {status:'partial'};
 return {status:'cited',verificationScope:'quote_and_version_only'};
}
export const EVIDENCE_BADGE='exact quote in selected version';
