const SMALL=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
export function words(n:number):string{if(n<20)return SMALL[n]!;if(n<100)return TENS[Math.floor(n/10)]!+(n%10?'-'+SMALL[n%10]:'');return SMALL[Math.floor(n/100)]!+' hundred'+(n%100?' '+words(n%100):'');}
/** Closed grammar, 0..366, with optional 'and' after hundreds. */
export function numberWords(text:string):number|null{const normalized=text.toLowerCase().trim().replace(/-/g,' ').replace(/\s+/g,' ');for(let n=0;n<=366;n++){const w=words(n).replace(/-/g,' ');if(normalized===w||n>100&&n%100!==0&&normalized===w.replace(' hundred ',' hundred and '))return n;}return null;}
export function parseNumber(text:string):{n:number}|{unknown:'conflicting_figures'|'deadline_unsupported'}{
 const m=/^(.+?)\s*\((\d+)\)$/.exec(text.trim());const plain=(s:string):number|null=>/^\d+$/.test(s)?Number(s):numberWords(s);
 if(m){const n=plain(m[1]!.trim()),digits=Number(m[2]);if(n===null||n>366||digits>366)return {unknown:'deadline_unsupported'};return n===digits?{n}:{unknown:'conflicting_figures'};}
 const n=plain(text.trim());return n===null||n>366?{unknown:'deadline_unsupported'}:{n};
}
