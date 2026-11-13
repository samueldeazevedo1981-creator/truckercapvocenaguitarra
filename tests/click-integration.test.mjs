import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {onsetEnvelope,detectBeats} from '../dist/beat-engine.js';import {clickWave,makeGrid,lowerBound} from '../dist/mix-engine.js';
const js=fs.readFileSync('dist/app.js','utf8'),section=js.slice(js.indexOf('function panName'),js.indexOf("$('loadModel').onclick"));
const inputs={clickEnabled:{checked:true},includeClick:{checked:true},clickBpm:{value:120},clickOffset:{value:0},clickVolume:{value:.5},clickPan:{value:-1},beatStatus:{}};
const $=id=>inputs[id]||(inputs[id]={});const playingRate=1;let posts=0,terminated=0;const starts=[],stops=[],timers=new Map();let timer=0;
class Worker{postMessage(data){posts++;queueMicrotask(()=>{try{this.onmessage({data:{result:detectBeats(data.envelope,data.rate,data.duration)}})}catch(error){this.onmessage({data:{error:error.message}})}})}terminate(){terminated++}}
const rate=11025,signal=new Float32Array(rate*10);for(let t=.23;t<10;t+=.5)for(let i=0;i<200;i++)signal[Math.round(t*rate)+i]=Math.sin(i*.2)*Math.exp(-i/40);
const param=()=>({value:0,setTargetAtTime(v){this.value=v}}),ac={sampleRate:rate,currentTime:1,createBuffer(c,n,r){return{sampleRate:r,copyToChannel(){}}},createBufferSource(){return{connect(){},disconnect(){},start(t){starts.push(t)},stop(){stops.push(1)}}},createGain(){return{gain:param(),connect(){},disconnect(){}}},createStereoPanner(){return{pan:param(),connect(){},disconnect(){}}},destination:{}};
const context=vm.createContext({$,onsetEnvelope,clickWave,makeGrid,lowerBound,Worker,URL,playingRate,SAMPLE_RATE:rate,window:{},console,setInterval(fn){timers.set(++timer,fn);return timer},clearInterval(id){timers.delete(id)},toast(message){throw Error(message)},audioContext(){return ac},setBusy(){},tracks:[{key:'drums',left:signal,right:signal,buffer:{duration:10}}],task:1,busy:false,jobKind:'',beatResult:null,beatAuto:false,beatWorker:null,beatPending:null,playing:false,started:0,ctx:ac,clickSources:[],clickTimer:null,clickBuffer:null,clickNext:0,liveBeats:[]});
vm.runInContext(section.replace('import.meta.url',"'https://example.test/app.js'"),context);
await Promise.race([vm.runInContext('analyzeBeat(1)',context),new Promise((_,reject)=>setTimeout(()=>reject(Error('Detector did not post to worker / timed out')),1000))]);
assert.equal(posts,1);assert.equal(terminated,1);assert.equal(context.beatAuto,true);assert(Math.abs(Number(inputs.clickBpm.value)-120)<1.5);assert(inputs.beatStatus.textContent.includes('Beat detectado'));
context.playing=true;context.started=.8;vm.runInContext('startClick()',context);assert.equal(timers.size,1);assert(starts.length>0);assert(starts.every(t=>t>=ac.currentTime));
vm.runInContext('stopClick()',context);assert.equal(timers.size,0);assert(stops.length>0);
// Seek forward: scheduling uses playback origin, not elapsed wall-clock ticks.
starts.length=0;ac.currentTime=10;context.started=5;vm.runInContext('startClick()',context);for(const fn of timers.values())fn();assert(starts.every(t=>t>=10));vm.runInContext('stopClick()',context);
inputs.clickBpm.value=0;context.toast=()=>{};vm.runInContext('manualBeat()',context);assert.equal(inputs.clickEnabled.checked,false);
console.log('PASS: actual detector sends data and completes, worker releases, click uses audio clock, pause/seek cancels and reschedules.');
