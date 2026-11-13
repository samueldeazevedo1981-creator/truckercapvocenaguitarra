import assert from 'node:assert/strict';
import {separateGuitar} from '../dist/guitar-model.js';

const n = 343980;
const stem = new Float32Array(12 * n);
for (let channel = 0; channel < 12; channel++) stem.fill(channel + 1, channel * n, (channel + 1) * n);
let disposed = 0;
const output = {dims: [1, 6, 2, n], data: stem, dispose(){ disposed++; }};
const ort = {Tensor: class {
  constructor(type, data, dims) {
    assert.equal(type, 'float32');
    assert.deepEqual(dims, [1, 2, n]);
    assert.equal(data[0], .25);
    assert.equal(data[n], .5);
  }
  dispose(){ disposed++; }
}};
const progress = [];
const session = {async run({mix}) { assert(mix); return {stems: output}; }};
const result = await separateGuitar(session, ort, new Float32Array(n + 1).fill(.25),
  new Float32Array(n + 1).fill(.5), .1, value => progress.push(value));
for (const [key, left, right] of [['guitar', 9, 10], ['vocals', 7, 8], ['backing', 20, 24]]) {
  assert.equal(result[key].left.length, n + 1);
  assert(result[key].left.every(value => Math.abs(value - left) < 1e-5));
  assert(result[key].right.every(value => Math.abs(value - right) < 1e-5));
}
assert.deepEqual(progress, [.5, 1]);
assert.equal(disposed, 4);
console.log('PASS: stereo guitar/voice routing, backing sum, overlap and tensor disposal.');
