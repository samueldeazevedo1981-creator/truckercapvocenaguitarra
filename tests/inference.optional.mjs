import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as ort from '../dist/vendor/ort/ort.wasm.min.mjs';
import {separateGuitar} from '../dist/guitar-model.js';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('../dist/vendor/ort/', import.meta.url).pathname;
const model = await fs.readFile(process.env.TC_STEMS_MODEL || 'htdemucs_6s_fp16weights.onnx');
const session = await ort.InferenceSession.create(model, {executionProviders: ['wasm']});
try {
  const input = Float32Array.from({length: 8 * 44100}, (_, i) => .1 * Math.sin(i * 440 * 2 * Math.PI / 44100));
  const result = await separateGuitar(session, ort, input, input, .1, progress => console.log(progress));
  for (const track of Object.values(result)) {
    assert.equal(track.left.length, input.length);
    assert.equal(track.right.length, input.length);
    assert(track.left.every(Number.isFinite) && track.right.every(Number.isFinite));
  }
} finally {
  await session.release();
}
