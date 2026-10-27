import type { Packet, Resolution, Section } from '../../src/core/types';
import type { ObligationRow, RunKind } from '../../src/core/row';
import { asOf } from '../../src/core/asof';
import { screenSource } from '../../src/core/screen';
import { sha256 } from '../../src/core/hash';
import { canonicalJSON } from '../../src/core/canonical-json';
import { inventory } from '../../src/core/extract';
import { UNKNOWN_REASONS } from '../../src/core/types';
import { verifyModelRows } from './model-boundary';
import { acquireRunLock } from '../lock';
import { Ledger } from '../ledger';
import type { ScheduledCall } from '../ledger';
import type { Provider, CompletionRequest, Completion } from '../providers/port';
export interface ModelContext { provider: Provider; ledger: Ledger; bound: ScheduledCall; model: string | null; prompt: string; runKind: RunKind; lockPath: string; lockHeld?:boolean; recordCompletion?:(response:Completion)=>void }
export type ModelResult = ({ status: 'ok'; rows: ObligationRow[] } | { status: 'not_run' | 'invalid' | 'screen_blocked' | 'failed'; reason: string; rows: [] }) & {claimedSections?:Section[];claimsStatus?:'valid'|'missing'|'invalid'|'not_produced'};
const spanSchema={type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2};
const closed=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const fieldSchema=(known:unknown)=>({anyOf:[closed({unknown:{type:'string',enum:[...UNKNOWN_REASONS]}}),closed({known,evidenceSpan:spanSchema})]});
const sectionSchema=closed({sectionId:{type:'string',pattern:'^sec-[0-9]+$'},path:{type:'string',pattern:'^Sec\\. [0-9]+$'},heading:{type:'string'},text:{type:'string'}});
export const responseSchema: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['rows'], properties: {
    rows: { type: 'array', maxItems: 30, items: closed({sectionId:{type:'string',pattern:'^sec-[0-9]+$'},subdivision:{type:'string'},clauseSpan:spanSchema,clauseText:{type:'string',minLength:1},
      actor:fieldSchema(closed({id:{type:'string'},raw:{type:'string',minLength:1}})),modality:fieldSchema({type:'string',enum:['must','must_not','may','need_not']}),
      action:fieldSchema(closed({predicateSpan:spanSchema,headVerb:{type:'string'}})),deadline:fieldSchema(closed({kind:{type:'string',enum:['absolute','relative_calendar_days','before_event','none_stated']},n:{type:'integer',minimum:0,maximum:366},unit:{const:'calendar_days'},anchorText:{type:'string'},eventKey:{type:'string'},date:{type:'string'},dueDate:{type:['string','null']}},['kind'])),
      conditions:{type:'array',items:{type:'string'}},exceptions:{type:'array',items:{type:'string'}}},['sectionId','subdivision','clauseSpan','clauseText','actor','modality','action','deadline']) }, sections: { type: 'array', maxItems: 12, items:sectionSchema },
  },
};
const contract = 'Return {rows:[{sectionId,subdivision,clauseSpan:[start,end],clauseText,actor,modality,action,deadline,conditions:[],exceptions:[]}]}.' +
  ' Each scored field is {known:value,evidenceSpan:[start,end]} or {unknown:reason}. actor value {id,raw}; modality must/must_not/may/need_not;' +
  ' action {predicateSpan:[start,end],headVerb}; deadline {kind:absolute|relative_calendar_days|before_event|none_stated,n?,unit?,anchorText?,date?}.' +
  ' Offsets are section-local UTF-16. dueDate and eventKey are recomputed by code. M1b also returns sections:[{sectionId,path,heading,text}].';
export function claimedResolution(value: unknown, actual: Resolution): Resolution {
  if (!value || typeof value !== 'object' || !('sections' in value) || !Array.isArray(value.sections) || value.sections.length > 12) throw new Error('model_invalid: claimed sections');
  const ids = new Set<string>();
  const sections: Section[] = value.sections.map((s: unknown) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('model_invalid: section');
    const v = s as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'heading,path,sectionId,text' || !['heading', 'path', 'sectionId', 'text'].every(k => typeof v[k] === 'string') || !/^sec-\d+$/.test(v.sectionId as string) || ids.has(v.sectionId as string)) throw new Error('model_invalid: section shape');
    ids.add(v.sectionId as string); return v as unknown as Section;
  });
  if (sections.reduce((n, s) => n + s.text.length, 0) > 131072) throw new Error('model_invalid: claimed state too large');
  return { ...actual, provisions: sections.map(s => ({ ...s, tainted: actual.provisions.find(p => p.sectionId === s.sectionId)?.tainted ?? null })), stateHash: sha256(canonicalJSON(sections)) };
}
export async function runModelArm(arm: 'M1a' | 'M1b-small' | 'M1b-mid' | 'H', packet: Packet, date: string, triggerDates: Record<string, string>, context: ModelContext): Promise<ModelResult> {
  if (!context.model || context.ledger.cap === 0) return { status: 'not_run', reason: 'Live access/model freeze pending; cap defaults to zero.', rows: [] };
  if (context.runKind !== 'measured') return { status: 'not_run', reason: 'Live dispatch only produces measured runs; replay is a separate input path.', rows: [] };
  const resolution = asOf(packet, date);
  const text = arm.startsWith('M1b') ? JSON.stringify(packet) : resolution.provisions.map(p => p.text).join('\n');
  if (!screenSource(text).allowed) return { status: 'screen_blocked', reason: 'Untrusted instruction-like source blocked before provider dispatch.', rows: [] };
  const candidates=arm==='H'?inventory(packet,date).filter(c=>c.kind==='obligation'):undefined;
  if(candidates&&candidates.length>30)return {status:'invalid',reason:'model_invalid: candidate cap',rows:[]};
  const request: CompletionRequest = { model: context.model, maxOutputTokens: context.bound.outputTokenBound, schema: responseSchema,
    messages: [{ role: 'system', content: context.prompt + '\n' + contract }, { role: 'user', content: JSON.stringify({ date, triggerDates,
      untrustedSource: arm.startsWith('M1b') ? packet : { enactmentId: packet.enactment.id, sections: resolution.provisions },...(candidates?{candidates:candidates.map(c=>({sectionId:c.sectionId,subdivision:c.subdivision,clauseSpan:c.span,clauseText:c.text}))}:{}) }) }] };
  const release = context.lockHeld ? ()=>{} : acquireRunLock(context.lockPath);
  let proposed:Resolution|undefined;
  let claimsStatus:ModelResult['claimsStatus']=arm.startsWith('M1b')?'not_produced':undefined;
  try {
    const response = await context.ledger.dispatch(context.provider, request, context.bound);
    context.recordCompletion?.(response);
    if(arm.startsWith('M1b')){
      claimsStatus=response.value!==null&&typeof response.value==='object'&&Object.hasOwn(response.value,'sections')?'invalid':'missing';
      proposed=claimedResolution(response.value,resolution);
      claimsStatus='valid';
    }
    const rows = verifyModelRows(response.value, packet, date, triggerDates, arm, 'measured', proposed);
    if (arm === 'H') {
      // H proposals may not choose a different clause than an actual candidate; no fallback on failure.
      if (rows.some(r => !candidates!.some(c => c.sectionId === r.sectionId && c.span[0] === r.clauseSpan[0] && c.span[1] === r.clauseSpan[1]))) throw new Error('model_invalid: H outside candidate clause');
    }
    return { status: 'ok', rows, ...claimFields(proposed,claimsStatus) };
  } catch (error) {
    if(error instanceof Error&&error.message.startsWith('not_run:'))return {status:'not_run',reason:'Owner-local provider access is not configured.',rows:[]};
    if(error instanceof Error&&error.message.startsWith('model_invalid'))return {status:'invalid',reason:error.message,rows:[],...claimFields(proposed,claimsStatus)};
    return {status:'failed',reason:'Provider or budget boundary failed; reservation retained; stop this run.',rows:[]};
  } finally { release(); }
}
function claimFields(proposed:Resolution|undefined,claimsStatus:ModelResult['claimsStatus']):Pick<ModelResult,'claimedSections'|'claimsStatus'>{
  return {...(claimsStatus?{claimsStatus}:{}),...(proposed?{claimedSections:proposed.provisions.map(({sectionId,path,heading,text})=>({sectionId,path,heading,text}))}:{})};
}
/** Every scheduled M1b query is one denominator unit, including absent or invalid claims.
 * Valid claims survive invalid rows. Expected state is handwritten scorer input, never a repair.
 */
export function consolidationOutcome(queryId:string,result:ModelResult,expected:readonly {sectionId:string;text:string}[]){
  const claimed=result.claimedSections;
  const expectedMap=Object.fromEntries(expected.map(s=>[s.sectionId,s.text]));
  const claimMap=claimed?Object.fromEntries(claimed.map(s=>[s.sectionId,s.text])):null;
  return {queryId,rowStatus:result.status,claimsStatus:result.claimsStatus??(claimed?'valid':'not_produced'),denominator:1 as const,
    exact:claimed!==undefined&&canonicalJSON(expectedMap)===canonicalJSON(claimMap),claimed:claimed??null};
}
export function replayModelArm(value: unknown, packet: Packet, date: string, triggerDates: Record<string, string>, arm: string, runKind: 'authored_replay' | 'captured_replay') {
  return verifyModelRows(value, packet, date, triggerDates, arm, runKind);
}
