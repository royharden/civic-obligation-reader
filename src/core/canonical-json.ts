export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
/** Object keys sorted by UTF-16 code unit order; array order and text unchanged. */
export function canonicalJSON(value:unknown):string {
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonicalJSON).join(',')}]`;
 if(typeof value==='object'&&value!==null){const o=value as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonicalJSON(o[k])}`).join(',')}}`;}
 throw new TypeError('Canonical JSON requires finite JSON values');
}
