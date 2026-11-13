import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('dist/app.js','utf8');
const config=app.slice(app.indexOf('const practiceModes='),app.indexOf('let practiceMode='));
const playback = app.slice(app.indexOf('function stopPlayback'),app.indexOf('function download('));
const modes = app.slice(app.indexOf('function applyPracticeMode'),app.indexOf('function renderTracks'));
const events = app.slice(app.indexOf("$('soloGuitar').onclick"),app.indexOf("for(const id of ['helpBtn'"));
const elements = new Map();
const $ = id => {
  if(!elements.has(id))elements.set(id,{setAttribute(key,value){this[key]=value}});
  return elements.get(id);
};
const media = {currentTime:0,preservesPitch:false,play:async()=>{},pause(){},removeAttribute(){},load(){}};
elements.set('practiceAudio',media);
const ac = {currentTime:0,resume:async()=>{}};
const tracks = ['guitar','backing','instrumental'].map(key=>({key,buffer:{duration:4}}));
const state = vm.createContext({
  $,ctx:ac,tracks,audioContext:()=>ac,busy:false,playing:false,
  playbackRate:1,playingRate:1,playRequest:0,practiceMode:'solo',offset:0,started:0,
  mediaKey:'',mediaURL:'',raf:0,clock:String,controls(){},startClick(){},stopClick(){},
  saveCurrentSong(){},openSong(){},removeSong(){},wavBytes:()=>new ArrayBuffer(0),Blob,URL,
  requestAnimationFrame(){},cancelAnimationFrame(){},toast(message){throw Error(message)}
});
vm.runInContext(config+playback+modes+events,state);
state.applyPracticeMode();
assert.deepEqual(tracks.map(t=>t.mute),[false,true,true]);
await state.play();
media.currentTime=1;
$('practiceSpeed').value='.5';
$('practiceSpeed').onchange();
assert.equal(media.playbackRate,.5);
assert.equal(media.preservesPitch,true);
assert.equal(media.currentTime,1);
$('noGuitar').onclick();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(media.currentTime,1);
assert.equal(media.playbackRate,.5);
assert.deepEqual(tracks.map(t=>t.mute),[true,false,true]);
$('noGuitarVoice').onclick();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(media.currentTime,1);
assert.deepEqual(tracks.map(t=>t.mute),[true,true,false]);
state.stopPlayback();
console.log('PASS: playback preserves pitch, rate and position across practice modes.');
