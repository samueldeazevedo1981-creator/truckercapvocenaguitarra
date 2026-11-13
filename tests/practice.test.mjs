import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {activeGain} from '../dist/audio-utils.js';

const app = fs.readFileSync('dist/app.js', 'utf8');
const playback = app.slice(app.indexOf('function stopPlayback'), app.indexOf('function download('));
const modes = app.slice(app.indexOf('function applyPracticeMode'), app.indexOf('function renderTracks'));
const buttons = app.slice(app.indexOf("$('soloGuitar').onclick"), app.indexOf("for(const id of ['helpBtn'"));
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, {setAttribute(name, value){this[name] = value;}});
  return elements.get(id);
};
const param = () => ({value: 0, setTargetAtTime(value){this.value = value;}});
const audio = {
  currentTime: 10, destination: {}, async resume(){},
  createBufferSource(){return {playbackRate:param(), connect(){}, disconnect(){}, start(){}, stop(){}};},
  createGain(){return {gain:param(), connect(){}, disconnect(){}};},
  createStereoPanner(){return {pan:param(), connect(){}, disconnect(){}};}
};
const tracks = ['guitar', 'vocals', 'backing'].map(key => ({key, volume:1, buffer:{duration:4}}));
const sandbox = vm.createContext({
  $, ctx:audio, tracks, activeGain, audioContext:()=>audio, busy:false, playing:false,
  playbackRate:1, playingRate:1, playRequest:0, practiceMode:'solo', offset:0, started:0,
  raf:0, nodes:[], clock:String, controls(){}, startClick(){}, stopClick(){},
  requestAnimationFrame(){}, cancelAnimationFrame(){}, toast(message){throw Error(message);}
});
vm.runInContext(playback + modes + buttons, sandbox);
const gains = () => tracks.map(track => activeGain(track, tracks));
$('soloGuitar').onclick();
assert.deepEqual(gains(), [1,0,0]);
await sandbox.play();
audio.currentTime = 11.05;
assert(Math.abs(sandbox.playbackPosition() - 1) < 1e-8);
$('practiceSpeed').value = '.5';
$('practiceSpeed').onchange();
await new Promise(resolve => setImmediate(resolve));
assert.equal(sandbox.playingRate, .5);
assert(Math.abs(sandbox.playbackPosition() - 1) < 1e-8);
$('noGuitar').onclick();
assert.equal($('voiceOption').hidden, false);
assert.deepEqual(gains(), [0,1,1]);
$('muteVoice').checked = true;
$('muteVoice').onchange();
assert.deepEqual(gains(), [0,0,1]);
$('soloGuitar').onclick();
assert.equal($('voiceOption').hidden, true);
assert.deepEqual(gains(), [1,0,0]);
audio.currentTime = 12.10;
assert(Math.abs(sandbox.playbackPosition() - 1.5) < 1e-8);
console.log('PASS: switching practice modes and speed preserves position; voice toggle affects backing only.');
