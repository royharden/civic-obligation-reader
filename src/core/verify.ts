import type { Span } from './types';
export type QuoteResult={quote:'exact'}|{quote:'invalid';reason:'offsets'|'mismatch'|'surrogate'};
export function verifyQuote(text:string,start:number,end:number,quote:string):QuoteResult{
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>text.length)return {quote:'invalid',reason:'offsets'};
 const split=(at:number):boolean=>at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1]!)&&/[\uDC00-\uDFFF]/.test(text[at]!);
 if(split(start)||split(end))return {quote:'invalid',reason:'surrogate'};
 return text.slice(start,end)===quote?{quote:'exact'}:{quote:'invalid',reason:'mismatch'};
}
export function contained(span:Span,parent:Span):boolean{return Number.isInteger(span[0])&&Number.isInteger(span[1])&&span[0]>=parent[0]&&span[1]>=span[0]&&span[1]<=parent[1];}
