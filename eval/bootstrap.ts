import { BOOTSTRAP_SEED, mulberry32 } from './seed';
/** Resample whole enactment/date queries, never individual fields or assertions. */
export function bootstrap<T>(queries:readonly T[],statistic:(sample:readonly T[])=>number,iterations=1000,seed=BOOTSTRAP_SEED):{low:number;high:number;seed:number;iterations:number}{
 if(!Number.isInteger(iterations)||iterations<1)throw new RangeError('Invalid bootstrap iterations');if(!queries.length)return {low:0,high:0,seed,iterations};const random=mulberry32(seed),values:number[]=[];
 for(let i=0;i<iterations;i++){const sample=Array.from({length:queries.length},()=>queries[Math.floor(random()*queries.length)]!);values.push(statistic(sample));}values.sort((a,b)=>a-b);return {low:values[Math.floor((values.length-1)*0.025)]!,high:values[Math.floor((values.length-1)*0.975)]!,seed,iterations};
}
