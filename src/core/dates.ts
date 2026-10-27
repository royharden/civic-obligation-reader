/** Proleptic Gregorian dates, years 0001..9999; no clock or timezone. */
export function isLeapYear(y:number):boolean {return y%4===0&&(y%100!==0||y%400===0);}
function monthDays(y:number,m:number):number {return [31,isLeapYear(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]??0;}
export function isValidDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y=0,m=0,d=0]=value.split('-').map(Number);return y>=1&&m>=1&&m<=12&&d>=1&&d<=monthDays(y,m);
}
export function dateOrdinal(value:string):number {
 if(!isValidDate(value))throw new RangeError('Invalid Gregorian date');
 const [y=0,m=0,d=0]=value.split('-').map(Number);const p=y-1;
 let n=365*p+Math.floor(p/4)-Math.floor(p/100)+Math.floor(p/400)+d-1;
 for(let j=1;j<m;j++)n+=monthDays(y,j);return n;
}
export function daysBetween(from:string,to:string):number {return dateOrdinal(to)-dateOrdinal(from);}
export function addDays(value:string,days:number):string {
 if(!Number.isSafeInteger(days))throw new RangeError('Days must be an integer');
 let n=dateOrdinal(value)+days;if(n<0||n>3652058)throw new RangeError('Date outside 0001..9999');
 let lo=1,hi=10000;while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(dateOrdinal(`${String(mid).padStart(4,'0')}-01-01`)<=n)lo=mid;else hi=mid;}
 n-=dateOrdinal(`${String(lo).padStart(4,'0')}-01-01`);let m=1;while(n>=monthDays(lo,m)){n-=monthDays(lo,m);m++;}
 return `${String(lo).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(n+1).padStart(2,'0')}`;
}
