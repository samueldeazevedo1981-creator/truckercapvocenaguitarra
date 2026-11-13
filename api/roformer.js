import {timingSafeEqual} from 'node:crypto';

export default async function handler(req, res) {
  const token = process.env.MVSEP_API_TOKEN;
  const access = process.env.ROFORMER_ACCESS_CODE;
  if (req.method === 'GET' && req.query?.available === '1') {
    return res.json({available: Boolean(token && access)});
  }
  if (!token || !access) return res.status(503).json({error:'Roformer ainda não configurado.'});
  const expected = Buffer.from('Bearer ' + access);
  const provided = Buffer.from(req.headers.authorization || '');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({error:'Código de acesso inválido.'});
  }
  res.setHeader('Cache-Control','no-store');
  try {
    if (req.method === 'POST') {
      const parts = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 4_300_000) return res.status(413).json({error:'Arquivo acima de 4,3 MB. Escolha um MP3 menor ou um trecho de até 24 segundos.'});
        parts.push(part);
      }
      if (!size) return res.status(400).json({error:'Áudio ausente.'});
      const form = new FormData();
      form.set('api_token',token);
      form.set('sep_type','63');
      form.set('output_format','0');
      const mp3 = req.headers['content-type'] === 'audio/mpeg';
      form.set('audiofile',new Blob(parts,{type:mp3?'audio/mpeg':'audio/wav'}),mp3?'trucker-cap.mp3':'trucker-cap.wav');
      const response = await fetch('https://mvsep.com/api/separation/create',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.hash) {
        return res.status(502).json({error:'O MVSep recusou o processamento. Confira a conta e os limites de uso.'});
      }
      return res.json({hash:data.data.hash});
    }
    if (req.method !== 'GET' || typeof req.query?.hash !== 'string' || !/^[a-zA-Z0-9._-]{8,250}$/.test(req.query.hash)) {
      return res.status(400).json({error:'Identificador inválido.'});
    }
    const url = new URL('https://mvsep.com/api/separation/get');
    url.searchParams.set('hash',req.query.hash);
    const response = await fetch(url,{signal:AbortSignal.timeout(20000)});
    const data = await response.json();
    if (!response.ok || !data.success) return res.status(502).json({error:'Resultado indisponível no MVSep.'});
    if (req.query.stem) {
      const stem = req.query.stem;
      if (!['guitar','vocals'].includes(stem) || data.status !== 'done') return res.status(404).end();
      const file = data.data?.files?.find(item => new RegExp('_'+stem+'\\.mp3(?:[?#]|$)','i').test(item.url || ''));
      if (!file) return res.status(502).json({error:'Faixa ausente no resultado.'});
      const source = new URL(file.url);
      if (source.protocol !== 'https:' || !source.hostname.endsWith('.mvsep.com')) return res.status(502).end();
      const audio = await fetch(source,{redirect:'error',signal:AbortSignal.timeout(20000)});
      if (!audio.ok) return res.status(502).end();
      const bytes = await audio.arrayBuffer();
      if (bytes.byteLength > 4_300_000) return res.status(413).json({error:'Faixa processada grande demais. Selecione um trecho menor.'});
      res.setHeader('Content-Type','audio/mpeg');
      return res.send(Buffer.from(bytes));
    }
    return res.json({status:data.status,position:data.data?.current_order});
  } catch {
    return res.status(502).json({error:'Falha de comunicação com o MVSep.'});
  }
}
export const config = {api:{bodyParser:false}};
