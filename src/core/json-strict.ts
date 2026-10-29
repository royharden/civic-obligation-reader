import type { Json } from './canonical-json';
import { utf8Bytes } from './hash';
export function parseStrictJson(text:string,maxDepth=8):Json {
 if(text.charCodeAt(0)===0xfeff)throw new SyntaxError('BOM is not allowed');
 if(utf8Bytes(text).length>131072)throw new SyntaxError('Packet exceeds 128 KiB');
 let i=0;const fail=(message:string):never=>{throw new SyntaxError(`${message} at UTF-16 offset ${i}`);};
 const ws=():void=>{while(/[ \t\r\n]/.test(text.charAt(i))&&i<text.length)i++;};
 const string=():string=>{const start=i++;while(i<text.length){const c=text.charAt(i++);if(c==='"'){let v:unknown;try{v=JSON.parse(text.slice(start,i));}catch{fail('Invalid string');}if(typeof v!=='string')return fail('Invalid string');utf8Bytes(v);return v;}if(c==='\\')i++;else if(c.charCodeAt(0)<32)fail('Control character');}return fail('Unterminated string');};
 const value=(depth:number):Json=>{ws();const c=text.charAt(i);
 if(c==='{'||c==='['){if(depth>=maxDepth)fail('Nesting depth exceeds limit');i++;ws();
 if(c==='{'){const out:Record<string,Json>=Object.create(null) as Record<string,Json>;const keys=new Set<string>();if(text.charAt(i)==='}'){i++;return out;}
 while(true){ws();if(text.charAt(i)!=='"')fail('Expected object key');const k=string();if(keys.has(k))fail('Duplicate JSON key');keys.add(k);ws();if(text.charAt(i++)!==':')fail('Expected colon');out[k]=value(depth+1);ws();const next=text.charAt(i++);if(next==='}')return out;if(next!==',')fail('Expected comma or closing brace');}}
 const out:Json[]=[];if(text.charAt(i)===']'){i++;return out;}while(true){out.push(value(depth+1));ws();const next=text.charAt(i++);if(next===']')return out;if(next!==',')fail('Expected comma or closing bracket');}}
 if(c==='"')return string();for(const [word,v] of [['true',true],['false',false],['null',null]] as const){if(text.startsWith(word,i)){i+=word.length;return v;}}
 const match=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(match===null||match.index!==0)return fail('Expected JSON value');i+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))return fail('Nonfinite number');return n;};
 const result=value(0);ws();if(i!==text.length)fail('Trailing content');return result;
}
