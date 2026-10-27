import type { RunKind } from '../src/core/row';
export function isRunKind(value:unknown):value is RunKind{return value==='authored_replay'||value==='captured_replay'||value==='measured';}
export function requireMeasured(kinds:readonly RunKind[],split:'dev'|'hidden'):void{if(kinds.some(k=>k!=='measured'))throw new Error(`${split} results.md accepts measured rows only`);}
export function resultDirectory(split:'dev'|'hidden',kind:RunKind):string{if(split==='hidden'&&kind!=='measured')throw new Error('Hidden split requires measured kind');return `results/${split}/${kind}`;}
