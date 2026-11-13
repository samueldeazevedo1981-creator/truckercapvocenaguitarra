import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareMix,makeGrid,lowerBound,clickWave} from '../dist/mix-engine.js';
import {onsetEnvelope,detectBeats} from '../dist/beat-engine.js';
const near=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const track={left:Float32Array.of(.2,.4),right:Float32Array.of(.6,.8),gain:1};
let out=prepareMix([track]).render(0,2);near(out.left[0],.2);near(out.right[0],.6);
out=prepareMix([{...track,pan:-1}]).render(0,2);near(out.left[0],.8);near(out.right[0],0);
out=prepareMix([{...track,pan:1}]).render(0,2);near(out.left[0],0);near(out.right[0],.8);
out=prepareMix([{...track,gain:0}]).render(0,2);near(out.left[0],0);near(out.right[0],0);
assert.deepEqual(makeGrid(2,120,.25),[.25,.75,1.25,1.75]);assert.deepEqual(makeGrid(1,120,-.25),[.25,.75]);assert.throws(()=>makeGrid(10,0));assert.throws(()=>makeGrid(10,120,NaN));assert.equal(lowerBound([.2,.7,1.2],.5),1);
const rate=11025,zero=new Float32Array(rate*3),beats=[.333,.833,1.333,1.833,2.333,2.833];
const engine=prepareMix([{left:zero,right:zero,gain:0}],{enabled:true,beats,volume:.6,pan:-1},rate);
const full=engine.render(0,zero.length),chunkL=new Float32Array(zero.length),chunkR=new Float32Array(zero.length);
for(let i=0;i<zero.length;i+=1000){const d=engine.render(i,Math.min(1000,zero.length-i));chunkL.set(d.left,i);chunkR.set(d.right,i)}
assert.deepEqual(full.left,chunkL);assert.deepEqual(full.right,chunkR);assert(full.left.some(x=>Math.abs(x)>.1));assert(full.right.every(x=>Math.abs(x)<1e-6));assert(prepareMix([{left:zero,right:zero,gain:0}],{enabled:false,beats,volume:1},rate).render(0,zero.length).left.every(x=>x===0));
// Non-zero alignment, mixed drums and quiet background; known ground-truth beat times.
for(const bpm of [72,100,120,150]){const seconds=35,n=seconds*rate,l=new Float32Array(n),r=new Float32Array(n),truth=[];for(let t=.37;t<seconds;t+=60/bpm){truth.push(t);const pos=Math.round(t*rate);for(let i=0;i<Math.min(rate*.06,n-pos);i++){const v=Math.sin(2*Math.PI*100*i/rate)*Math.exp(-i/(rate*.012));l[pos+i]+=v;r[pos+i]+=.8*v}}for(let i=0;i<n;i++){l[i]+=.02*Math.sin(i*2*Math.PI*220/rate);r[i]+=.02*Math.sin(i*2*Math.PI*330/rate)}const features=onsetEnvelope(l,r,rate),detected=detectBeats(features.envelope,features.rate,seconds);console.log('Known',bpm,'detected',detected.bpm.toFixed(2),'phase',detected.offset.toFixed(3));near(detected.bpm,bpm,1.5);let error=0;for(const t of truth)error+=Math.min(...detected.beats.map(b=>Math.abs(b-t)));assert(error/truth.length<.04,'beat alignment drift');}
assert.throws(()=>detectBeats(new Float32Array(1000),100,10));assert.throws(()=>detectBeats(Float32Array.of(.1),100,.01));
const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest'));assert.equal(manifest.name,'Trucker Cap Você na Guitarra');for(const icon of manifest.icons)assert(fs.existsSync('dist/'+icon.src.replace('./','')));
const html=fs.readFileSync('dist/index.html','utf8');assert(!html.includes('Uma música.'));assert(!html.includes('Quatro possibilidades.'));console.log('PASS: equal-power stereo pan endpoints/centre, mute, click alignment, chunk-boundary continuity, click export off/on, known-BPM detection and branded icons.');
