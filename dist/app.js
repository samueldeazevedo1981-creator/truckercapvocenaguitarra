import {repertoire} from './repertoire.js';
import {prepareMix,clickWave,makeGrid,lowerBound} from './mix-engine.js';
import {onsetEnvelope} from './beat-engine.js';
import {SAMPLE_RATE,activeGain,wavBytes,clipRange,clock,processingWindows,overlapWeight,separationPlan,inferenceThreads,buildPracticeBases} from './audio-utils.js';
const $=id=>document.getElementById(id);const MODEL_URL='https://huggingface.co/alekshandru/htdemucs-6s-onnx/resolve/main/htdemucs_6s_fp16weights.onnx';
const MODEL_KEY='7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869';
const TRACKS=['guitar','vocals'];
let currentSong=null, mediaURL='', mediaKey='', savedKeys=[];
const practiceModes={
 original:{track:'original',button:'originalMode',suffix:'musica_inteira'},
 solo:{track:'guitar',button:'soloGuitar',suffix:'so_guitarra'},
 backing:{track:'backing',button:'noGuitar',suffix:'sem_guitarra'},
 instrumental:{track:'instrumental',button:'noGuitarVoice',suffix:'sem_guitarra_e_voz'}
};
let previewSeek=false;
let practiceMode='solo', playbackRate=1, playingRate=1, playRequest=0;
let beatResult=null,beatAuto=false,beatWorker=null,beatPending=null,clickTimer=null,clickSources=[],clickNext=0,liveBeats=[],clickBuffer;
let processingBase=0,processingSpan=1,processingLabel='';
let selectedFile=null,metadataAudio=null,metadataURL=null,renderedFileName='',encoderWorker=null,encoderPending=null,jobKind='';
let ctx,decoded,fileName='',worker,pending,ready=false,busy=false,downloadController,task=0,tracks=[],playing=false,offset=0,started=0,raf=0,toastTimer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000)}
function status(text,value){$('status').textContent=text;if(value!==undefined){$('progress').hidden=false;$('progress').value=Math.max(0,Math.min(1,value))}}
function controls(){
 if(!ready)$('loadModel').textContent='↓ Preparar IA';for(const id of ['loadModel','localModelBtn','modelFile','audioFile','clipStart','clipLength','customLength','separationMode','clickBpm','clickOffset','clickEnabled','clickVolume','clickPan','includeClick','halfTempo','doubleTempo','exportFormat','mp3Bitrate'])$(id).disabled=busy;$('loadModel').disabled=busy||ready||!globalThis.Worker||!globalThis.WebAssembly||!globalThis.crypto?.subtle;$('separate').disabled=busy||!selectedFile;$('cancel').hidden=!busy;$('detectBeat').disabled=busy||!tracks.length;$('clickEnabled').disabled=busy||!tracks.length;$('clipStart').disabled=busy||$('clipLength').value==='full';$('originalMp3').disabled=busy||!selectedFile;$('downloadMix').disabled=busy||!tracks.length;for(const id of ['soloGuitar','noGuitar','practiceSpeed','play','stop','seek'])$(id).disabled=busy||!tracks.length;$('originalMode').disabled=busy||!tracks.some(track=>track.key==='original');$('legacyOriginal').hidden=!tracks.length||tracks.some(track=>track.key==='original');$('noGuitarVoice').disabled=busy||!tracks.some(track=>track.key==='instrumental');$('legacyModes').hidden=!tracks.length||tracks.some(track=>track.key==='instrumental');$('saveSong').disabled=busy||!currentSong;$('songList').disabled=busy||!savedKeys.length;$('openSong').disabled=busy||!savedKeys.length;$('removeSong').disabled=busy||!savedKeys.length;}
function setBusy(value){busy=value;controls();if(!value)$('progress').hidden=true;}
function audioContext(){if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Este navegador não oferece o processamento de áudio necessário.');try{ctx=new AC({sampleRate:SAMPLE_RATE})}catch{ctx=new AC()}}return ctx}
function stopPlayback(reset=false){
 playRequest++;
 previewSeek=false;
 const media=$('practiceAudio');
 if(playing&&!media.ended)offset=media.currentTime;
 media.pause();
 playing=false;
 stopClick();
 cancelAnimationFrame(raf);
 if(reset)offset=0;
 $('play').textContent='▶';
 $('play').setAttribute('aria-label','Reproduzir faixas');
 updatePosition();
}
function updatePosition(){
 if(previewSeek)return;
 $('position').textContent=clock(offset);
 $('seek').value=offset;
}
function releasePracticeMedia(){
 const media=$('practiceAudio');
 media.removeAttribute('src');
 media.load();
 if(mediaURL)URL.revokeObjectURL(mediaURL);
 mediaURL='';
 mediaKey='';
}
function practiceAudio(){
 const media=$('practiceAudio');
 if(mediaKey!==practiceMode){
   releasePracticeMedia();
   const track=tracks.find(track=>track.key===practiceModes[practiceMode].track);
   mediaURL=URL.createObjectURL(new Blob([wavBytes(track.left,track.right)],{type:'audio/wav'}));
   media.src=mediaURL;
   mediaKey=practiceMode;
 }
 media.preservesPitch=true;
 if('webkitPreservesPitch' in media)media.webkitPreservesPitch=true;
 media.playbackRate=playbackRate;
 media.currentTime=Math.min(offset,tracks[0].buffer.duration);
 return media;
}
async function play(){
 if(busy||!tracks.length)return;
 if(playing){stopPlayback();return}
 const request=++playRequest;
 if(offset>=tracks[0].buffer.duration-.01)offset=0;
 const media=practiceAudio();
 const ac=audioContext();
 if(ac.state!=='running')ac.resume().catch(()=>{});
 try {
   await media.play();
 } catch(error) {
   if(request!==playRequest)return;
   media.pause();
   throw error;
 }
 if(request!==playRequest||busy)return;
 playing=true;
 playingRate=playbackRate;
 started=ac.currentTime-offset/playingRate;
 startClick(playingRate);
 $('play').textContent='Ⅱ';
 $('play').setAttribute('aria-label','Pausar faixas');
 const tick=()=>{
   if(!playing)return;
   if(media.ended){
     stopPlayback(true);
     const index=savedKeys.indexOf(currentSong?.id);
     if(practiceMode!=='solo'&&index>=0&&index+1<savedKeys.length){
       $('songList').value=savedKeys[index+1];
       openSong(practiceMode);
     }
     return;
   }
   offset=media.currentTime;
   updatePosition();
   raf=requestAnimationFrame(tick);
 };
 raf=requestAnimationFrame(tick);
}
function download(bytes,name){const url=URL.createObjectURL(new Blob([bytes],{type:name.endsWith('.mp3')?'audio/mpeg':'audio/wav'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function safeName(name=renderedFileName||fileName){return name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,70)||'trucker_cap'}
function applyPracticeMode(){
 for(const track of tracks)track.mute=track.key!==practiceModes[practiceMode].track;
 for(const [mode,{button}] of Object.entries(practiceModes)){
   $(button).setAttribute('aria-pressed',String(mode===practiceMode));
 }
 controls();
}
function changeMode(mode){
 if(practiceMode===mode||!tracks.some(track=>track.key===practiceModes[mode].track))return;
 const resume=playing;
 stopPlayback();
 practiceMode=mode;
 applyPracticeMode();
 if(resume)play().catch(error=>toast(error.message));
}
function renderTracks(song,mode='solo'){
 stopPlayback(true);
 releasePracticeMedia();
 beatResult=null;
 beatAuto=false;
 $('clickEnabled').checked=false;
 $('beatStatus').textContent='Use Reconhecer beat para alinhar o click.';
 currentSong=song;
 renderedFileName=song.name;
 tracks=Object.entries(song.audio).map(([key,{left,right}])=>({
   key,left,right,buffer:{duration:left.length/SAMPLE_RATE},mute:false,solo:false,volume:1,pan:0
 }));
 practiceMode=song.audio[practiceModes[mode].track]?mode:'backing';
 $('emptyMixer').hidden=true;
 $('trackList').hidden=false;
 $('projectName').textContent=song.name;
 $('seek').max=tracks[0].buffer.duration;
 $('duration').textContent=clock(tracks[0].buffer.duration);
 applyPracticeMode();
}
async function refreshSongs(selected){
 savedKeys=await repertoire('keys');
 const list=$('songList');
 list.replaceChildren(...savedKeys.map(key=>new Option(key.split('\n')[0],key)));
 if(savedKeys.includes(selected))list.value=selected;
 $('noSongs').hidden=Boolean(savedKeys.length);
 list.hidden=!savedKeys.length;
 $('openSong').hidden=!savedKeys.length;
 $('removeSong').hidden=!savedKeys.length;
 controls();
}
async function saveCurrentSong(){
 if(!currentSong||busy)return;
 setBusy(true);
 try{
   await repertoire('put',currentSong);
   await refreshSongs(currentSong.id);
   toast('Música salva em Meu Repertório.');
 }catch(error){toast('Não foi possível salvar. Verifique o espaço disponível no navegador.')}
 finally{setBusy(false)}
}
async function openSong(mode='backing'){
 const id=$('songList').value;
 if(busy||!id)return;
 setBusy(true);
 try{
   const song=await repertoire('get',id);
   if(!song)throw Error('Música indisponível.');
   renderTracks(song,mode);
   $('trackList').scrollIntoView({block:'nearest'});
 }catch(error){toast(error.message)}
 finally{setBusy(false)}
}
async function removeSong(){
 const id=$('songList').value;
 if(busy||!id)return;
 setBusy(true);
 try{await repertoire('delete',id);await refreshSongs()}
 catch(error){toast('Não foi possível remover a música.')}
 finally{setBusy(false)}
}
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('TRUCKER_CAP_STEMS_V1',1);req.onupgradeneeded=()=>req.result.createObjectStore('models');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function modelStore(action,value){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models',action==='get'?'readonly':'readwrite'),store=tx.objectStore('models');let result;const req=action==='get'?store.get(MODEL_KEY):action==='put'?store.put(value,MODEL_KEY):store.delete(MODEL_KEY);req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
function ensureWorker(){if(worker)return;worker=new Worker(new URL('./separator-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.type==='progress'){status(processingLabel+' · IA '+Math.round(data.value*100)+'%',processingBase+processingSpan*data.value);return}if(!pending)return;const {resolve,reject}=pending;pending=null;if(data.type==='error'){ready=false;worker?.terminate();worker=null;reject(Error('O processamento local falhou: '+data.message))}else resolve(data)};worker.onerror=()=>{ready=false;pending?.reject(Error('O motor de IA foi interrompido. Pode haver falta de memória ou incompatibilidade do navegador.'));pending=null;worker?.terminate();worker=null;controls()}}
function send(message,transfer=[]){ensureWorker();return new Promise((resolve,reject)=>{if(pending){reject(Error('Aguarde a operação atual.'));return}pending={resolve,reject};worker.postMessage(message,transfer)})}
async function modelBuffer(blob){
 if(blob.size<100000000||blob.size>220000000)throw Error('Use o modelo HTDemucs de seis fontes indicado no app (cerca de 136 MB).');
 const buffer=await blob.arrayBuffer();
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));
 const hash=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
 if(hash!==MODEL_KEY)throw Error('O arquivo está incompleto ou não corresponde ao modelo indicado.');
 return buffer;
}
async function downloadModel(){downloadController=new AbortController();const controller=downloadController;const timeout=setTimeout(()=>controller.abort(),600000);try{const response=await fetch(MODEL_URL,{signal:controller.signal});if(!response.ok)throw Error('Não foi possível baixar a IA ('+response.status+'). Tente novamente ou use o modelo local.');const reader=response.body?.getReader();if(!reader)return new Blob([await response.arrayBuffer()]);const parts=[];let loaded=0;const total=Number(response.headers.get('content-length'))||136000000;while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.length;if(loaded>220000000)throw Error('Download maior que o esperado.');status('Baixando modelo · '+(loaded/1048576).toFixed(0)+' MB',Math.min(.95,loaded/total));}return new Blob(parts)}finally{clearTimeout(timeout);if(downloadController===controller)downloadController=null}}
async function prepare(localFile){if(busy)return;jobKind='model';const current=++task;setBusy(true);let cached=false;status('Procurando modelo salvo neste navegador…',0);try{let blob=localFile;if(!blob){try{blob=await modelStore('get');cached=!!blob}catch{}if(!blob)blob=await downloadModel()}if(current!==task)return;status('Verificando modelo e iniciando IA…',.96);const buffer=cached?await blob.arrayBuffer():await modelBuffer(blob);if(current!==task)return;const appleMobile=navigator.maxTouchPoints>1&&/iPad|iPhone|Macintosh/.test(navigator.userAgent);
const threads=appleMobile?1:inferenceThreads(globalThis.crossOriginIsolated,navigator.hardwareConcurrency);
let engine;
try {
 engine=await send({type:'load',buffer,threads},[buffer]);
} catch(error) {
 if(current!==task||threads===1)throw error;
 status('Reiniciando a IA em modo compatível…');
 const fallback=await blob.arrayBuffer();
 if(current!==task)return;
 engine=await send({type:'load',buffer:fallback,threads:1},[fallback]);
}
if(current!==task)return;
let persisted=cached;
if(!cached){try{await modelStore('put',blob);persisted=true}catch{}}
if(current!==task)return;$('modelStatus').textContent=persisted?'IA salva neste navegador':'IA pronta nesta sessão · sem espaço para salvar';ready=true;$('loadModel').textContent='✓ IA preparada';$('loadModel').disabled=true;$('modelStatus').textContent+=' · pronto · '+engine.threads+' núcleo(s)';status('IA preparada. Processe a música inteira ou escolha um trecho.');}catch(error){if(current!==task)return;ready=false;worker?.terminate();worker=null;if(cached){try{await modelStore('delete')}catch{}}if(current!==task)return;$('modelStatus').textContent='Falha na preparação · tente novamente';console.error(error);status(error.name==='AbortError'?'O download demorou demais. Clique em Preparar música para tentar novamente.':/Aborted|wasm|memory/i.test(error.message)?'O motor de áudio não conseguiu iniciar. Recarregue a página e tente novamente.':error.message)}finally{if(current===task){setBusy(false);$('loadModel').disabled=ready}}}
async function chooseAudio(file){if(!file||busy)return;if(!/\.(mp3|wav)$/i.test(file.name)){toast('Escolha MP3 ou WAV.');return}stopPlayback();selectedFile=file;decoded=null;fileName=file.name;if(metadataAudio){metadataAudio.onloadedmetadata=null;metadataAudio.onerror=null;metadataAudio.removeAttribute('src');metadataAudio.load()}if(metadataURL)URL.revokeObjectURL(metadataURL);$('fileLabel').textContent=file.name;$('fileMeta').textContent=(file.size/1048576).toFixed(1)+' MB';$('fileHint').textContent='Arquivo selecionado · lendo duração…';$('clipStart').value=0;$('clipStart').removeAttribute('max');status('Arquivo pronto. Clique em Preparar música.');controls();metadataURL=URL.createObjectURL(file);metadataAudio=new Audio();metadataAudio.preload='metadata';const audio=metadataAudio;audio.onloadedmetadata=()=>{if(selectedFile!==file)return;$('fileHint').textContent=Number.isFinite(audio.duration)?clock(audio.duration)+' · pronto para processar':'Duração calculada ao processar';if(Number.isFinite(audio.duration))$('clipStart').max=Math.max(0,Math.floor(audio.duration)-1);audio.onloadedmetadata=null;audio.removeAttribute('src');audio.load();if(metadataURL){URL.revokeObjectURL(metadataURL);metadataURL=null}};audio.onerror=()=>{if(selectedFile===file)$('fileHint').textContent='Arquivo escolhido · duração calculada ao processar'};audio.src=metadataURL;}
async function ensureDecoded(current){if(decoded)return decoded;const file=selectedFile;if(!file)throw Error('Selecione um áudio.');status('Decodificando áudio para processamento. Arquivos longos podem demorar…');const ac=audioContext();await ac.resume();const buffer=await file.arrayBuffer();if(current!==task)throw Error('Operação cancelada.');const result=await ac.decodeAudioData(buffer);if(current!==task)throw Error('Operação cancelada.');decoded=result;$('fileHint').textContent=clock(result.duration)+' · '+result.numberOfChannels+' canal(is)';return result}
function encoderMessage(message,transfer=[]){return new Promise((resolve,reject)=>{encoderPending={resolve,reject};encoderWorker.postMessage(message,transfer)})}
async function exportAudio(original=false){if(busy||(!original&&!tracks.length)||(original&&!selectedFile))return;jobKind='export';const current=++task;setBusy(true);stopPlayback();const format=original?'mp3':$('exportFormat').value,parts=[];let localEncoder;
 try{let inputTracks,rate,name,click=null;if(original){const audio=await ensureDecoded(current);inputTracks=[{left:audio.getChannelData(0),right:audio.getChannelData(Math.min(1,audio.numberOfChannels-1)),gain:1,pan:0}];rate=audio.sampleRate;name=safeName(fileName)+'_original'}else{inputTracks=tracks.map(t=>({left:t.left,right:t.right,gain:activeGain(t,tracks),pan:t.pan}));rate=SAMPLE_RATE;name=safeName()+'_'+practiceModes[practiceMode].suffix;click=getClickConfig(true)}if(current!==task)return;
 const length=inputTracks[0].left.length,chunkSize=65536,engine=prepareMix(inputTracks,click,rate);let peak=1;status('Preparando mixagem · pan e click…',0);
 for(let start=0;start<length;start+=chunkSize){if(current!==task)return;const data=engine.render(start,Math.min(chunkSize,length-start));for(let i=0;i<data.left.length;i++)peak=Math.max(peak,Math.abs(data.left[i]),Math.abs(data.right[i]));if(start%(chunkSize*8)===0)await new Promise(r=>setTimeout(r,0))}
 if(format==='wav'){const left=new Float32Array(length),right=new Float32Array(length);for(let start=0;start<length;start+=chunkSize){if(current!==task)return;const data=engine.render(start,Math.min(chunkSize,length-start),peak);left.set(data.left,start);right.set(data.right,start);if(start%(chunkSize*8)===0)await new Promise(r=>setTimeout(r,0))}download(wavBytes(left,right,rate),name+'.wav');status('WAV pronto. Download solicitado.');return}
 encoderWorker=new Worker(new URL('./mp3-worker.js',import.meta.url));localEncoder=encoderWorker;encoderWorker.onmessage=({data})=>{if(encoderWorker!==localEncoder)return;const pending=encoderPending;encoderPending=null;if(!pending)return;data.type==='error'?pending.reject(Error(data.message)):pending.resolve(data)};encoderWorker.onerror=()=>{if(encoderWorker!==localEncoder)return;encoderPending?.reject(Error('O conversor MP3 foi interrompido pelo navegador.'));encoderPending=null};await encoderMessage({type:'init',sampleRate:rate,bitrate:Number($('mp3Bitrate').value)});
 for(let start=0;start<length;start+=chunkSize){if(current!==task)return;const {left,right}=engine.render(start,Math.min(chunkSize,length-start),peak);const {bytes}=await encoderMessage({type:'encode',left,right},[left.buffer,right.buffer]);if(bytes.length)parts.push(bytes);status('Convertendo para MP3 · '+Math.round(Math.min(length,start+chunkSize)/length*100)+'%',Math.min(1,(start+chunkSize)/length))}const {bytes}=await encoderMessage({type:'flush'});if(bytes.length)parts.push(bytes);if(current!==task)return;download(new Blob(parts,{type:'audio/mpeg'}),name+'.mp3');status('MP3 pronto · '+$('mp3Bitrate').value+' kbps. Download solicitado.');
 }catch(error){if(current===task)status('Não foi possível exportar: '+error.message)}finally{localEncoder?.terminate();if(encoderWorker===localEncoder){encoderWorker=null;encoderPending=null}if(current===task)setBusy(false)}}
async function prepareSong(){
 if(busy||!selectedFile)return;
 try{
   await audioContext().resume();
   if(!ready)await prepare();
   if(ready)await separate();
 }catch(error){status('Não consegui abrir o áudio. '+error.message)}
}
async function separate(){if(busy||!selectedFile||!ready)return;jobKind='separate';const current=++task;setBusy(true);stopPlayback(true);let clip;try{await ensureDecoded(current);if(current!==task)return;clip=clipRange($('clipStart').value,$('clipLength').value==='custom'?$('customLength').value:$('clipLength').value,decoded.duration)}catch(error){if(current===task){setBusy(false);status(error.message)}return}status('Preparando processamento por blocos…',0);
 // Starting a new separation replaces the previous session's mixer results.
 tracks=[];currentSong=null;releasePracticeMedia();$('trackList').hidden=true;$('emptyMixer').hidden=false;for(const id of ['play','stop','seek','downloadMix'])$(id).disabled=true;
 try{const size=Math.ceil(clip.length*SAMPLE_RATE),plan=separationPlan($('separationMode').value),windows=processingWindows(size,plan.block,plan.overlap),overlap=plan.overlap,ac=audioContext(),result={};for(const key of TRACKS){const buffer=ac.createBuffer(2,size,SAMPLE_RATE);result[key]={buffer,left:buffer.getChannelData(0),right:buffer.getChannelData(1)}}const original={left:new Float32Array(size),right:new Float32Array(size)};const weights=new Float32Array(size);const startedAt=performance.now();
 for(let block=0;block<windows.length;block++){if(current!==task)return;const win=windows[block],length=win.end-win.start;processingBase=block/windows.length;processingSpan=1/windows.length;processingLabel='Parte '+(block+1)+' de '+windows.length+' · '+clock(win.start/SAMPLE_RATE)+' / '+clock(clip.length);status(processingLabel+' · preparando áudio',processingBase);
 const OfflineContext=window.OfflineAudioContext||window.webkitOfflineAudioContext;const offline=new OfflineContext(2,length,SAMPLE_RATE),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start(0,clip.start+win.start/SAMPLE_RATE,length/SAMPLE_RATE);const resampled=await offline.startRendering();if(current!==task)return;const left=new Float32Array(resampled.getChannelData(0)),right=new Float32Array(resampled.getChannelData(1));original.left.set(left,win.start);original.right.set(right,win.start);const {result:part}=await send({type:'separate',left,right,overlap:plan.ratio},[left.buffer,right.buffer]);if(current!==task)return;
 const blockTracks=TRACKS.map(key=>{
   const track=part[key];
   if(!track||track.left.length!==length||track.right.length!==length)throw Error('A IA retornou um bloco incompleto.');
   return [track,result[key]];
 });
 for(let i=0;i<length;i++){
   const target=win.start+i, weight=overlapWeight(i,length,overlap,win.hasPrevious,win.hasNext);
   weights[target]+=weight;
   for(const [track,output] of blockTracks){
     const left=track.left[i],right=track.right[i];
     if(!Number.isFinite(left)||!Number.isFinite(right))throw Error('A IA retornou valores inválidos.');
     output.left[target]+=left*weight;
     output.right[target]+=right*weight;
   }
 }
 const elapsed=(performance.now()-startedAt)/1000,remaining=elapsed/(block+1)*(windows.length-block-1);status('Parte '+(block+1)+' de '+windows.length+' concluída'+(remaining>1?' · estimativa restante '+clock(remaining):''),(block+1)/windows.length);await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const key of TRACKS){if(current!==task)return;for(let i=0;i<size;i++){if(weights[i]>0){result[key].left[i]/=weights[i];result[key].right[i]/=weights[i]}}await new Promise(resolve=>setTimeout(resolve,0));}if(current!==task)return;
 const {guitar,vocals}=result;
 const {backing,instrumental}=buildPracticeBases(original,guitar,vocals);
 const name=fileName+' · '+clock(clip.start)+' — '+clock(clip.start+clip.length);
 const id=[name,selectedFile.size,selectedFile.lastModified,clip.start,clip.length].join('\n');
 renderTracks({id,name,audio:{
   original,
   guitar:{left:guitar.left,right:guitar.right},
   backing,
   instrumental
 }});
 status('Guitarra e base prontas para praticar.');
 $('trackList').scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(error){if(current===task)status(error instanceof RangeError||/memory|allocation|buffer/i.test(error.message)?'O aparelho ficou sem memória. Tente um trecho menor ou um computador com mais RAM.':error.message)}finally{if(current===task)setBusy(false)}}

function panName(value){return Math.abs(value)<.005?'Centro':(value<0?'L ':'R ')+Math.round(Math.abs(value)*100)+'%'}
function getClickConfig(exporting=false){const duration=tracks[0]?.buffer.duration||0;return {enabled:duration>0&&(exporting?$('includeClick').checked:$('clickEnabled').checked),volume:Number($('clickVolume').value),pan:Number($('clickPan').value),beats:beatAuto&&beatResult?beatResult.beats:makeGrid(duration,$('clickBpm').value,Number($('clickOffset').value)/1000)}}
function stopClick(){clearInterval(clickTimer);clickTimer=null;for(const item of clickSources){item.source.onended=null;try{item.source.stop()}catch{}item.source.disconnect();item.gain.disconnect();item.panner.disconnect()}clickSources=[]}
function startClick(rate=1){stopClick();if(!playing||!$('clickEnabled').checked)return;const config=getClickConfig(),ac=audioContext();liveBeats=config.beats;clickNext=lowerBound(liveBeats,Math.max(0,(ac.currentTime-started)*rate));if(!clickBuffer||clickBuffer.sampleRate!==ac.sampleRate){const wave=clickWave(ac.sampleRate);clickBuffer=ac.createBuffer(2,wave.length,ac.sampleRate);clickBuffer.copyToChannel(wave,0);clickBuffer.copyToChannel(wave,1)}
 const schedule=()=>{if(!playing)return;const time=ac.currentTime;if(!isNaN($('practiceAudio').currentTime))started=time-$('practiceAudio').currentTime/rate;while(clickNext<liveBeats.length&&started+liveBeats[clickNext]/rate<time+.18){const at=started+liveBeats[clickNext++]/rate;if(at<time-.005)continue;const source=ac.createBufferSource(),gain=ac.createGain(),panner=ac.createStereoPanner();source.buffer=clickBuffer;gain.gain.value=Number($('clickVolume').value);panner.pan.value=Number($('clickPan').value);source.connect(gain);gain.connect(panner);panner.connect(ac.destination);const item={source,gain,panner};clickSources.push(item);source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();clickSources=clickSources.filter(x=>x!==item)};source.start(Math.max(time,at))}};schedule();clickTimer=setInterval(schedule,25)}
async function analyzeBeat(current=task){if(!tracks.length)return;let localBeatWorker;stopClick();$('beatStatus').textContent='Reconhecendo BPM e posição das batidas no acompanhamento…';try{const backing=tracks.find(t=>t.key==='backing')||tracks[0];const data=onsetEnvelope(backing.left,backing.right,SAMPLE_RATE);beatWorker?.terminate();beatWorker=new Worker(new URL('./beat-worker.js',import.meta.url),{type:'module'});localBeatWorker=beatWorker;const result=await new Promise((resolve,reject)=>{beatPending={resolve,reject};beatWorker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.result);beatWorker.onerror=()=>reject(Error('Não foi possível analisar o beat neste navegador.'));beatWorker.postMessage(data,[data.envelope.buffer])});if(current!==task)return;beatResult=result;beatAuto=true;$('clickBpm').value=result.bpm.toFixed(1);$('clickOffset').value=Math.round(result.offset*1000);$('beatStatus').textContent='Beat detectado · '+result.bpm.toFixed(1)+' BPM · alinhamento automático'+(result.confidence<.4?' · pulso pouco definido: confira ao ouvir.':'. Confira ao ouvir; use ÷2 ou ×2 se necessário.');}catch(error){if(current!==task)return;beatResult=null;beatAuto=false;$('beatStatus').textContent=error.message+' Ajuste BPM e alinhamento.'}finally{localBeatWorker?.terminate();if(beatWorker===localBeatWorker){beatWorker=null;beatPending=null}if(current===task&&playing)startClick(playingRate)}}
function manualBeat(){try{makeGrid(tracks[0]?.buffer.duration||0,$('clickBpm').value,Number($('clickOffset').value)/1000);beatAuto=false;$('beatStatus').textContent='Click manual · '+$('clickBpm').value+' BPM · alinhamento '+$('clickOffset').value+' ms. Tempo fixo.';if(playing)startClick(playingRate)}catch(error){toast(error.message);$('clickEnabled').checked=false;stopClick()}}
$('detectBeat').onclick=async()=>{if(busy||!tracks.length)return;jobKind='beat';const current=++task;setBusy(true);try{await analyzeBeat(current)}finally{if(current===task)setBusy(false)}};
$('clickBpm').onchange=manualBeat;$('clickOffset').onchange=manualBeat;
for(const [id,multiplier]of [['halfTempo',.5],['doubleTempo',2]])$(id).onclick=()=>{$('clickBpm').value=Math.max(30,Math.min(300,Number($('clickBpm').value)*multiplier)).toFixed(1);manualBeat()};
$('clickEnabled').onchange=()=>{try{if(playing)startClick(playingRate)}catch(error){$('clickEnabled').checked=false;toast(error.message)}};
$('clickVolume').oninput=()=>{$('clickVolumeLabel').textContent=Math.round(Number($('clickVolume').value)*100)+'%';for(const item of clickSources)item.gain.gain.setTargetAtTime(Number($('clickVolume').value),ctx.currentTime,.01)};
$('clickPan').oninput=()=>{$('clickPanLabel').textContent=panName(Number($('clickPan').value));for(const item of clickSources)item.panner.pan.setTargetAtTime(Number($('clickPan').value),ctx.currentTime,.01)};
$('loadModel').onclick=()=>prepare();$('localModelBtn').onclick=()=>$('modelFile').click();$('modelFile').onchange=e=>{const file=e.target.files[0];if(file)prepare(file);e.target.value=''};$('audioFile').onchange=e=>{chooseAudio(e.target.files[0]);e.target.value=''};$('separate').onclick=prepareSong;$('clipLength').onchange=()=>{$('customLengthWrap').hidden=$('clipLength').value!=='custom';controls()};$('cancel').onclick=()=>{task++;beatWorker?.terminate();beatWorker=null;beatPending?.reject(Error('Análise cancelada.'));beatPending=null;downloadController?.abort();encoderWorker?.terminate();encoderWorker=null;encoderPending?.reject(Error('Conversão cancelada.'));encoderPending=null;if(jobKind==='separate'||jobKind==='model'){worker?.terminate();worker=null;pending?.reject(Error('Operação cancelada.'));pending=null;ready=false;$('modelStatus').textContent='Motor interrompido · prepare a IA novamente';$('loadModel').textContent='↓ Preparar IA'}setBusy(false);status('Operação cancelada. O arquivo original permanece no aparelho.')}
;
$('play').onclick=()=>play().catch(error=>toast(error.message));$('stop').onclick=()=>stopPlayback(true);$('seek').onpointerdown=()=>{previewSeek=true};
$('seek').oninput=()=>{
 previewSeek=true;
 $('position').textContent=clock(Number($('seek').value));
};
function commitSeek(){
 if(!previewSeek)return;
 previewSeek=false;
 offset=Number($('seek').value);
 const media=$('practiceAudio');
 if(mediaKey===practiceMode)media.currentTime=offset;
 if(playing){
   started=ctx.currentTime-offset/playingRate;
   startClick(playingRate);
 }
 updatePosition();
}
$('seek').onchange=commitSeek;
$('seek').onblur=commitSeek;
$('seek').onpointercancel=()=>{
 previewSeek=false;
 updatePosition();
};
$('seek').onpointerup=commitSeek;
$('downloadMix').onclick=()=>exportAudio().catch(error=>toast(error.message));$('originalMp3').onclick=()=>exportAudio(true).catch(error=>toast(error.message));

$('soloGuitar').onclick=()=>changeMode('solo');
$('originalMode').onclick=()=>changeMode('original');
$('noGuitar').onclick=()=>changeMode('backing');
$('noGuitarVoice').onclick=()=>changeMode('instrumental');
$('saveSong').onclick=saveCurrentSong;
$('openSong').onclick=()=>openSong();
$('removeSong').onclick=removeSong;
$('practiceSpeed').onchange=()=>{
 playbackRate=Number($('practiceSpeed').value);
 if(!playing)return;
 const media=$('practiceAudio');
 media.playbackRate=playbackRate;
 playingRate=playbackRate;
 started=ctx.currentTime-media.currentTime/playingRate;
 startClick(playingRate);
};
for(const id of ['helpBtn','helpTop'])$(id).onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();$('clearModel').onclick=async()=>{if(busy){toast('Cancele o processamento antes de remover o modelo.');return}try{await modelStore('delete');worker?.terminate();worker=null;ready=false;$('modelStatus').textContent='Modelo removido deste navegador';$('loadModel').textContent='↓ Preparar IA';controls();toast('Modelo removido. Os downloads de áudio não foram alterados.')}catch(error){toast(error.message)}};
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('drag')});for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('drag');if(name==='drop')chooseAudio(e.dataTransfer.files[0])});
window.addEventListener('pagehide',event=>{stopPlayback();if(!event.persisted){worker?.terminate();encoderWorker?.terminate();beatWorker?.terminate()}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(async()=>{const registration=await navigator.serviceWorker.ready;const cache=await caches.open('tc-stems-shell-guitar-v7');const response=await cache.match(new URL('./index.html',location.href).href);$('offlineStatus').textContent=response?'App salvo · IA separada':'App on-line';}).catch(()=>{$('offlineStatus').textContent='App on-line · cache indisponível'});else $('offlineStatus').textContent='Navegador sem instalação off-line';
try{if(!globalThis.Worker||!globalThis.WebAssembly||!crypto.subtle){$('loadModel').disabled=true;status('Este navegador não oferece os recursos necessários para a IA local.')}}catch{}controls();

refreshSongs().catch(()=>toast('O repertório local está indisponível neste navegador.'));
