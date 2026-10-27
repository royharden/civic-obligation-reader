import type { Packet } from './types';
import { parseStrictJson } from './json-strict';
import { isValidDate } from './dates';
import { utf8Bytes } from './hash';
export class PacketValidationError extends Error {
 readonly errors:string[];
 constructor(errors:string[]){super(errors.join('\n'));this.name='PacketValidationError';this.errors=errors;}
}
export type PacketValidation = {ok:true;packet:Packet}|{ok:false;errors:string[]};
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const id=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/,sid=/^sec-\d+$/;
/** Validate objects as well as text input: reject non-JSON values, cycles and surrogates. */
export function validatePacket(value:unknown):PacketValidation {
 const errors:string[]=[];const error=(p:string,m:string):void=>{errors.push(`${p}: ${m}`);};
 const walk=(v:unknown,depth:number,ancestors:Set<object>):void=>{
 if(typeof v==='string'){try{utf8Bytes(v);}catch{error('$','lone surrogate');}return;}
 if(v===null||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))return;
 if(typeof v!=='object'||v===null){error('$','non-JSON value');return;}
 if(depth>=8){error('$','nesting depth exceeds 8');return;}
 if(ancestors.has(v)){error('$','cyclic value');return;}const next=new Set(ancestors);next.add(v);
 if(Array.isArray(v)&&(Object.keys(v).length!==v.length||Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).some(present=>!present)))error('$','sparse or extended array is not a JSON array');
 if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)error('$','non-JSON object');
 for(const [k,x] of Object.entries(v)){try{utf8Bytes(k);}catch{error('$','lone surrogate in key');}walk(x,depth+1,next);}};
 walk(value,0,new Set());
 if(errors.length===0){try{if(utf8Bytes(JSON.stringify(value)).length>131072)error('$','exceeds 128 KiB');}catch{error('$','not serializable');}}
 const keys=(v:Obj,p:string,required:string[],optional:string[]=[]):void=>{for(const k of required)if(!Object.hasOwn(v,k))error(p,`missing ${k}`);for(const k of Object.keys(v))if(!required.includes(k)&&!optional.includes(k))error(p,`unknown key ${k}`);};
 const str=(v:Obj,k:string,p:string,nonempty=false,re?:RegExp):void=>{const x=v[k];if(typeof x!=='string'||(nonempty&&x.length===0)||(re!==undefined&&typeof x==='string'&&!re.test(x)))error(`${p}.${k}`,'invalid string');};
 const date=(v:Obj,k:string,p:string):void=>{if(!isValidDate(v[k]))error(`${p}.${k}`,'invalid Gregorian date');};
 const section=(v:unknown,p:string):void=>{if(!obj(v)){error(p,'expected section');return;}keys(v,p,['sectionId','path','heading','text']);str(v,'sectionId',p,true,sid);str(v,'path',p,true,/^Sec\. \d+$/);str(v,'heading',p);str(v,'text',p,true);};
 if(!obj(value))return {ok:false,errors:[...errors,'$: expected object']};
 keys(value,'$',['schemaVersion','enactment']);if(value.schemaVersion!=='s46.packet.v1')error('$','schemaVersion must be s46.packet.v1');
 const e=value.enactment;if(!obj(e))return {ok:false,errors:[...errors,'$.enactment: expected object']};
 keys(e,'enactment',['id','title','fictionalProvenance','enactedOn','commencesOn','sunsetExclusive','sections','amendments']);str(e,'id','enactment',true,id);str(e,'title','enactment',true);date(e,'enactedOn','enactment');date(e,'commencesOn','enactment');
 if(e.sunsetExclusive!==null)date(e,'sunsetExclusive','enactment');
 if(isValidDate(e.sunsetExclusive)&&isValidDate(e.commencesOn)&&e.sunsetExclusive<=e.commencesOn)error('enactment','sunset must follow commencement');
 const provenance=e.fictionalProvenance;if(!obj(provenance))error('provenance','expected object');else{keys(provenance,'provenance',['author','attestation','license']);str(provenance,'author','provenance',true);str(provenance,'attestation','provenance',true);if(provenance.license!=='CC0-1.0')error('provenance','license must be CC0-1.0');}
 const base=Array.isArray(e.sections)?e.sections:[];if(!Array.isArray(e.sections)||base.length===0)error('sections','expected nonempty array');
 const amendments=Array.isArray(e.amendments)?e.amendments:[];if(!Array.isArray(e.amendments)||amendments.length>6)error('amendments','expected array with at most 6 items');
 const known=new Set<string>();let total=0;const register=(v:unknown,p:string):void=>{total++;section(v,p);if(obj(v)&&typeof v.sectionId==='string'){if(known.has(v.sectionId))error(p,'duplicate section id');known.add(v.sectionId);}};
 base.forEach((s,k)=>register(s,`sections[${k}]`));for(const a of amendments)if(obj(a)&&Array.isArray(a.operations))for(const op of a.operations)if(obj(op)&&op.op==='addSection')register(op.section,'added section');if(total>12)error('sections','base + added cap 12');
 const aids=new Set<string>(),boundaries=new Set<string>();if(isValidDate(e.commencesOn))boundaries.add(e.commencesOn);
 amendments.forEach((a,k)=>{const p=`amendments[${k}]`;if(!obj(a)){error(p,'expected object');return;}
 keys(a,p,['amendmentId','enactedOn','effectiveOn','instructionText','affectedSectionIds','operations'],['order']);str(a,'amendmentId',p,true,id);str(a,'instructionText',p,true);date(a,'enactedOn',p);date(a,'effectiveOn',p);
 if(typeof a.amendmentId==='string'){if(aids.has(a.amendmentId))error(p,'duplicate amendment id');aids.add(a.amendmentId);}
 if(Object.hasOwn(a,'order')&&(!Number.isSafeInteger(a.order)||typeof a.order!=='number'||a.order<0))error(p,'order must be nonnegative safe integer');
 if(isValidDate(a.enactedOn)&&isValidDate(e.enactedOn)&&a.enactedOn<e.enactedOn)error(p,'enacted before base');
 if(isValidDate(a.effectiveOn)){boundaries.add(a.effectiveOn);if(isValidDate(e.commencesOn)&&a.effectiveOn<e.commencesOn)error(p,'effective before commencement');if(isValidDate(e.sunsetExclusive)&&a.effectiveOn>=e.sunsetExclusive)error(p,'effective at/after sunset');}
 const affected=Array.isArray(a.affectedSectionIds)?a.affectedSectionIds:[];if(!Array.isArray(a.affectedSectionIds)||affected.length===0||affected.length>12)error(p,'affectedSectionIds must have 1..12 entries');const seen=new Set<string>();for(const target of affected){if(typeof target!=='string'||!sid.test(target)||!known.has(target))error(p,'unknown affected section');else{if(seen.has(target))error(p,'duplicate affected section');seen.add(target);}}
 if(a.operations==='unstructured')return;if(!Array.isArray(a.operations)||a.operations.length===0){error(p,'operations must be nonempty or unstructured');return;}
 a.operations.forEach((op,j)=>{const q=`${p}.operations[${j}]`;if(!obj(op)){error(q,'expected operation');return;}
 let target:unknown;switch(op.op){
 case 'replaceText':keys(op,q,['op','sectionId','old','new'],['preimageSha256']);str(op,'old',q,true);str(op,'new',q);target=op.sectionId;break;
 case 'insertAfter':keys(op,q,['op','sectionId','anchor','text'],['preimageSha256']);str(op,'anchor',q,true);str(op,'text',q,true);target=op.sectionId;break;
 case 'repealSection':keys(op,q,['op','sectionId'],['preimageSha256']);target=op.sectionId;break;
 case 'addSection':keys(op,q,['op','afterSectionId','section']);if(typeof op.afterSectionId!=='string'||!sid.test(op.afterSectionId)||!known.has(op.afterSectionId))error(q,'unknown afterSectionId');target=obj(op.section)?op.section.sectionId:undefined;break;
 default:error(q,'unknown operation');return;}
 if(typeof target!=='string'||!sid.test(target)||!known.has(target)||!seen.has(target))error(q,'target must be known and listed in affectedSectionIds');
 if(Object.hasOwn(op,'preimageSha256'))str(op,'preimageSha256',q,true,/^[0-9a-f]{64}$/);
 });});
 if(boundaries.size>7)error('$','state cap 7');
 return errors.length?{ok:false,errors}:{ok:true,packet:value as unknown as Packet};
}
export function parsePacket(text:string):Packet {
 let value:unknown;try{value=parseStrictJson(text);}catch(e){throw new PacketValidationError([e instanceof Error?e.message:String(e)]);}
 const result=validatePacket(value);if(!result.ok)throw new PacketValidationError(result.errors);return result.packet;
}
