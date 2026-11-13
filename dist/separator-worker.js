import * as ort from './vendor/ort/ort.wasm.min.mjs';
import {separateGuitar} from './guitar-model.js';
import {inferenceThreads} from './audio-utils.js';

ort.env.wasm.numThreads = inferenceThreads(self.crossOriginIsolated, self.navigator?.hardwareConcurrency);
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('./vendor/ort/', import.meta.url).href;

let session;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      await session?.release();
      session = await ort.InferenceSession.create(data.buffer, {
        executionProviders: ['wasm'], graphOptimizationLevel: 'basic'
      });
      if (session.inputNames.join() !== 'mix' || session.outputNames.join() !== 'stems') {
        throw Error('Use o modelo HTDemucs de seis fontes indicado no app.');
      }
      self.postMessage({type: 'ready', threads: ort.env.wasm.numThreads});
    } else if (data.type === 'separate') {
      if (!session) throw Error('Prepare a IA antes de processar.');
      const result = await separateGuitar(session, ort, data.left, data.right, data.overlap,
        value => self.postMessage({type: 'progress', value}));
      const transfers = Object.values(result).flatMap(track => [track.left.buffer, track.right.buffer]);
      self.postMessage({type: 'result', result}, transfers);
    }
  } catch (error) {
    self.postMessage({type: 'error', message: error.message || String(error)});
  }
};
