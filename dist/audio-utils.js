export const SAMPLE_RATE=44100;
export const TRACKS=['vocals','drums','bass','other'];
export function activeGain(track,tracks){const anySolo=tracks.some(t=>t.solo);return track.mute||(anySolo&&!track.solo)?0:track.volume;}
export function wavBytes(left,right,sampleRate=SAMPLE_RATE){if(left.length!==right.length)throw Error('Canais de tamanhos diferentes.');if(left.length*4+36>0xffffffff)throw Error('Esta faixa ultrapassa o tamanho suportado pelo formato WAV padrão. Exporte um trecho menor.');const b=new ArrayBuffer(44+left.length*4),v=new DataView(b);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,left.length*4,true);for(let i=0;i<left.length;i++)for(let c=0;c<2;c++){const n=Math.max(-1,Math.min(1,Number.isFinite((c?right:left)[i])?(c?right:left)[i]:0));v.setInt16(44+i*4+c*2,n<0?n*32768:n*32767,true)}return b}
export function mixTracks(tracks){if(!tracks.length)throw Error('Não há faixas.');const n=tracks[0].left.length,l=new Float32Array(n),r=new Float32Array(n);for(const t of tracks){const g=activeGain(t,tracks);for(let i=0;i<n;i++){l[i]+=t.left[i]*g;r[i]+=t.right[i]*g}}let peak=1;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));if(peak>1)for(let i=0;i<n;i++){l[i]/=peak;r[i]/=peak}return {left:l,right:r}}
export function clipRange(start,length,duration){if(!Number.isFinite(duration)||duration<=0)throw Error('Duração de áudio inválida.');if(length==='full')return {start:0,length:duration};start=Number(start);length=Number(length);if(!Number.isFinite(start)||start<0||start>=duration)throw Error('O início precisa estar dentro da música.');if(!Number.isFinite(length)||length<=0)throw Error('Informe uma duração positiva para o trecho.');return {start,length:Math.min(length,duration-start)}}
export function processingWindows(total,block=24*SAMPLE_RATE,overlap=2*SAMPLE_RATE){if(!Number.isSafeInteger(total)||total<=0||block<=overlap||overlap<1)throw Error('Tamanho de processamento inválido.');const windows=[];for(let start=0;start<total;start+=block-overlap){const end=Math.min(total,start+block);windows.push({start,end,hasPrevious:start>0,hasNext:end<total});if(end===total)break}return windows}
export function overlapWeight(i,length,overlap,hasPrevious,hasNext){let w=1;if(hasPrevious&&i<overlap)w=Math.min(w,(i+1)/overlap);if(hasNext&&i>=length-overlap)w=Math.min(w,(length-i)/overlap);return w}

export function clock(n){n=Math.max(0,Number(n)||0);return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0')}

export function separationPlan(mode){const samples=343980,ratio=mode==='quality'?.25:.10,stride=Math.floor(samples*(1-ratio)),overlap=samples-stride;return {ratio,overlap,block:samples+2*stride}}
export function inferenceThreads(isolated,cores){return isolated?Math.min(4,Math.max(1,Math.floor((Number(cores)||2)/2))):1}

// Build practice mixes from the original so unclassified instruments remain audible.
// Reuse the vocal buffers for the instrumental after reading each vocal sample.
export function buildPracticeBases(original, guitar, vocals) {
  const backing = {};
  for (const channel of ['left', 'right']) {
    const mix = original[channel], lead = guitar[channel], voice = vocals[channel];
    const base = new Float32Array(mix.length);
    backing[channel] = base;
    for (let i = 0; i < mix.length; i++) {
      base[i] = mix[i] - lead[i];
      voice[i] = base[i] - voice[i];
    }
  }
  for (const track of [backing, vocals]) {
    let peak = 1;
    for (const channel of [track.left, track.right]) {
      for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 1) {
      for (const channel of [track.left, track.right]) {
        for (let i = 0; i < channel.length; i++) channel[i] /= peak;
      }
    }
  }
  return {backing, instrumental: {left: vocals.left, right: vocals.right}};
}
