import assert from 'node:assert/strict';
import {processingWindows,separationPlan,inferenceThreads} from '../dist/audio-utils.js';
import {DemucsProcessor} from '../dist/vendor/demucs/src/processor.js';
const N=343980,total=300*44100;
let old=0;for(const w of processingWindows(total))old+=Math.ceil((w.end-w.start)/Math.floor(N*.75));
const count=mode=>{const p=separationPlan(mode);return processingWindows(total,p.block,p.overlap).reduce((n,w)=>n+Math.max(1,1+Math.ceil(Math.max(0,w.end-w.start-N)/Math.floor(N*(1-p.ratio)))),0)};
assert(count('fast')<old);assert(count('quality')<old);assert.equal(inferenceThreads(false,16),1);assert.equal(inferenceThreads(true,16),4);assert.equal(inferenceThreads(true,2),1);
// Actual processor scheduling and merge, with a known unity output instead of AI.
let calls=0,disposed=0;const processor=new DemucsProcessor({ort:{Tensor:class{constructor(){}dispose(){disposed++}}}});
processor.segmentOverlap=.1;processor.session={inputNames:['wave'],outputNames:['time'],async run(){calls++;return {time:{dims:[1,4,2,N],data:new Float32Array(8*N).fill(.125),dispose(){disposed++}}}}};
const input=new Float32Array(N+100);input[0]=.1;const result=await processor.separate(input,input);assert.equal(calls,2);assert.equal(disposed,6);for(const t of Object.values(result)){assert.equal(t.left.length,input.length);for(const x of t.left)assert(Math.abs(x-.125)<1e-6)}
console.log(`PASS: five-minute inference calls ${old} -> ${count('fast')} fast / ${count('quality')} quality; continuous complete output including first/last samples; safe threads fallback.`);
