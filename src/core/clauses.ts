import type { Provision, Span } from './types';
export interface Clause {sectionId:string;subdivision:string;span:Span;text:string;heading:string}
/** Sentence clauses never cross subdivision lines. Sec. and decimal dots are not terminators. */
export function clauses(provision:Provision):Clause[]{
 const out:Clause[]=[];let offset=0,alpha='',numeric='';
 for(const line of provision.text.split('\n')){
  const marker=/^\s*(\([a-z]\)|\([0-9]+\)) /.exec(line);let begin=0;
  if(marker){begin=marker[0].length;if(/[a-z]/.test(marker[1]!)){alpha=marker[1]!;numeric='';}else numeric=marker[1]!;}
  while(begin<line.length){while(/\s/.test(line[begin]??'')&&begin<line.length)begin++;if(begin>=line.length)break;let end=line.length;
   for(let i=begin;i<line.length;i++)if(line[i]==='.'&&(i+1===line.length||/\s/.test(line[i+1]!))&&!/Sec$/i.test(line.slice(Math.max(begin,i-3),i))){end=i+1;break;}
   while(end>begin&&/\s/.test(line[end-1]!))end--;
   if(end>begin)out.push({sectionId:provision.sectionId,subdivision:alpha+numeric,span:[offset+begin,offset+end],text:line.slice(begin,end),heading:provision.heading});begin=end;
  }offset+=line.length+1;
 }return out;
}
