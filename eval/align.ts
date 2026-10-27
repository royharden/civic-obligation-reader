import type { Span } from '../src/core/types';
export interface Alignable {sectionId?:string;clauseSpan?:Span}
export function spanIoU(a:Span,b:Span):number{const intersection=Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0])),union=Math.max(a[1],b[1])-Math.min(a[0],b[0]);return union>0?intersection/union:0;}
export interface Alignment {pairs:{gold:number;prediction:number;iou:number}[];unmatchedGold:number[];unmatchedPredictions:number[]}
/** Hungarian assignment: maximum total IoU with dummy unmatched vertices, never duplicate a slot. */
export function align(gold:readonly Alignable[],predictions:readonly Alignable[]):Alignment{
 const n=gold.length+predictions.length;if(n===0)return {pairs:[],unmatchedGold:[],unmatchedPredictions:[]};
 const weight=(i:number,j:number):number=>{const g=gold[i],p=predictions[j];if(!g||!p||g.sectionId!==p.sectionId||!g.clauseSpan||!p.clauseSpan)return 0;const v=spanIoU(g.clauseSpan,p.clauseSpan);return v>=0.5?v:-1;};
 const u=Array<number>(n+1).fill(0),v=Array<number>(n+1).fill(0),assignment=Array<number>(n+1).fill(0),way=Array<number>(n+1).fill(0);
 for(let i=1;i<=n;i++){assignment[0]=i;let j0=0;const min=Array<number>(n+1).fill(Infinity),used=Array<boolean>(n+1).fill(false);
  do{used[j0]=true;const i0=assignment[j0]!;let delta=Infinity,j1=0;for(let j=1;j<=n;j++)if(!used[j]){const cost=-weight(i0-1,j-1)-u[i0]!-v[j]!;if(cost<min[j]!){min[j]=cost;way[j]=j0;}if(min[j]!<delta){delta=min[j]!;j1=j;}}for(let j=0;j<=n;j++){if(used[j]){u[assignment[j]!]=u[assignment[j]!]!+delta;v[j]=v[j]!-delta;}else min[j]=min[j]!-delta;}j0=j1;}while(assignment[j0]!==0);
  do{const j1=way[j0]!;assignment[j0]=assignment[j1]!;j0=j1;}while(j0!==0);
 }
 const pairs:Alignment['pairs']=[];for(let j=1;j<=n;j++){const gi=assignment[j]!-1,pi=j-1,w=weight(gi,pi);if(gi<gold.length&&pi<predictions.length&&w>=0.5)pairs.push({gold:gi,prediction:pi,iou:w});}
 pairs.sort((a,b)=>a.gold-b.gold);return {pairs,unmatchedGold:gold.map((_,i)=>i).filter(i=>!pairs.some(p=>p.gold===i)),unmatchedPredictions:predictions.map((_,i)=>i).filter(i=>!pairs.some(p=>p.prediction===i))};
}
