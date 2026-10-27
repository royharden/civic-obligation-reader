import { it,expect } from 'vitest';
import { renderReport,renderReplayReport,claimHolds } from '../../eval/report';
import { score } from '../../eval/score';
import { resultDirectory } from '../../eval/runkind';
it('results.md refuses every replay source and hidden replays have no output path',()=>{ // what_bug_this_catches: authored examples get published as measured performance.
 for(const runKind of ['authored_replay','captured_replay'] as const){expect(()=>renderReport({split:'dev',runKind,arms:[]})).toThrow(/measured/);expect(()=>renderReport({split:'dev',runKind:'measured',arms:[{arm:'B0',runKind,score:score([],[])}]})).toThrow(/measured/);expect(()=>resultDirectory('hidden',runKind)).toThrow();expect(renderReplayReport({split:'dev',runKind,arms:[]})).toContain('No measured results');}
});
it('a tie never satisfies the claim and no dev report evaluates a hidden headline',()=>{ // what_bug_this_catches: F1 tie described as a win or dev metrics promoted as held-out evidence.
 const s=score([],[]);expect(claimHolds(s,s)).toBe(false);expect(renderReport({split:'dev',runKind:'measured',arms:[{arm:'B0',runKind:'measured',score:s}]})).toContain('No held-out claim');
});
