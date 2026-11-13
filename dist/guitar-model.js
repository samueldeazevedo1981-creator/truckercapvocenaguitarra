import {overlapWeight} from './audio-utils.js';

const segmentSize = 343980;
const guitarIndex = 4;
const voiceIndex = 3;

export async function separateGuitar(session, ort, left, right, overlap, onProgress) {
  const result = Object.fromEntries(['guitar', 'vocals'].map(key => [
    key, {left: new Float32Array(left.length), right: new Float32Array(left.length)}
  ]));
  const stride = Math.floor(segmentSize * (1 - overlap));
  const segments = Math.max(1, 1 + Math.ceil((left.length - segmentSize) / stride));
  const weights = new Float32Array(left.length);
  const channels = [['left', 0], ['right', segmentSize]];

  for (let segment = 0; segment < segments; segment++) {
    const start = segment * stride;
    const length = Math.min(segmentSize, left.length - start);
    const wave = new Float32Array(2 * segmentSize);
    wave.set(left.subarray(start, start + length));
    wave.set(right.subarray(start, start + length), segmentSize);
    const input = new ort.Tensor('float32', wave, [1, 2, segmentSize]);
    let outputs;
    try {
      outputs = await session.run({mix: input});
      const stem = outputs.stems;
      if (!stem || stem.dims.join(',') !== '1,6,2,343980') {
        throw Error('Modelo incompatível: use o HTDemucs de seis fontes indicado no app.');
      }

      for (let i = 0; i < length; i++) {
        const weight = overlapWeight(i, length, segmentSize - stride, segment > 0, segment + 1 < segments);
        const target = start + i;
        weights[target] += weight;
        for (const [channel, shift] of channels) {
          const index = shift + i;
          result.guitar[channel][target] += stem.data[guitarIndex * 2 * segmentSize + index] * weight;
          result.vocals[channel][target] += stem.data[voiceIndex * 2 * segmentSize + index] * weight;
        }
      }
    } finally {
      input.dispose();
      for (const tensor of Object.values(outputs || {})) tensor.dispose();
    }
    onProgress((segment + 1) / segments);
  }

  for (const track of Object.values(result)) {
    for (let i = 0; i < weights.length; i++) {
      track.left[i] /= weights[i];
      track.right[i] /= weights[i];
    }
  }
  return result;
}
