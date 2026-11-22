import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {findMovie,download} from './provider.mjs';

export const manifest={id:'org.personal.turkcealtyazi.cloud',version:'1.1.0',name:'TürkçeAltyazı • Bulut',description:'TürkçeAltyazı.org film altyazıları. Bağımsız eklenti.',resources:['subtitles'],types:['movie'],idPrefixes:['tt'],catalogs:[]};
export function publicBase(env=process.env){
  const value=env.PUBLIC_URL||env.RENDER_EXTERNAL_URL;
  if(!value)throw Error('PUBLIC_URL veya RENDER_EXTERNAL_URL gerekli.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Genel adres https://alan-adi biçiminde olmalı.');
  return url.origin;
}
export function createServer({base,find=findMovie,fetchSubtitle=download}={}) {
  const cache=new Map();let active=0;
  async function cached(key,fn){
    const old=cache.get(key);if(old&&old.until>Date.now())return old.value;
    if(active>=8)throw Error('Sunucu meşgul; biraz sonra tekrar deneyin.');
    active++;
    const value=Promise.resolve().then(fn).finally(()=>active--);
    cache.set(key,{value,until:Date.now()+600000});
    if(cache.size>80)cache.delete(cache.keys().next().value);
    try{return await value;}catch(e){cache.delete(key);throw e;}
  }
  return http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','*');
    const send=(status,type,data)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);};
    const json=(status,data)=>send(status,'application/json; charset=utf-8',JSON.stringify(data));
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    if(req.method!=='GET')return json(405,{error:'GET gerekli'});
    if(req.url.length>4096)return json(414,{error:'Adres çok uzun'});
    try {
      const path=decodeURIComponent(new URL(req.url,base).pathname);
      if(path==='/manifest.json')return json(200,manifest);
      if(path==='/health')return json(200,{ok:true});
      if(path==='/')return send(200,'text/html; charset=utf-8',`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TürkçeAltyazı Bulut</title><style>body{background:#17152c;color:#eee;font:18px system-ui;max-width:720px;margin:60px auto;padding:24px}a{color:#b9a3ff}code{overflow-wrap:anywhere}</style><h1>TürkçeAltyazı • Bulut</h1><p><a href="${base.replace('https:','stremio:')}/manifest.json">Stremio’ya ekle</a></p><p>Manuel kurulum adresi:</p><code>${base}/manifest.json</code><p>Aynı Stremio hesabıyla TV’de oturum aç ve film oynarken Türkçe altyazı seç.</p><p>Tek CD SRT/VTT film altyazıları desteklenir. Senkron uyumu video sürümüne bağlıdır.</p></html>`);
      const match=path.match(/^\/subtitles\/movie\/(tt\d{7,10})(?:\/(.*))?\.json$/);
      if(match){
        const rows=await cached(match[1],()=>find(match[1]));
        const filename=(new URLSearchParams(match[2]||'').get('filename')||'').toLowerCase();
        const score=r=>r.release.toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>2&&filename.includes(t)).length;
        return json(200,{subtitles:[...rows].sort((a,b)=>score(b)-score(a)).map(r=>({id:`ta-${r.id}`,lang:'tur',url:`${base}/subtitle/${Buffer.from(r.path).toString('base64url')}.vtt`}))});
      }
      const sub=path.match(/^\/subtitle\/([A-Za-z0-9_-]{1,512})\.vtt$/);
      if(sub){
        const source=Buffer.from(sub[1],'base64url').toString('utf8');
        if(!/^\/sub\/\d+\/[a-zA-Z0-9_-]+\.html$/.test(source))return json(400,{error:'Geçersiz kaynak'});
        return send(200,'text/vtt; charset=utf-8',await cached(source,()=>fetchSubtitle(source)));
      }
      if(path.startsWith('/subtitles/'))return json(200,{subtitles:[]});
      return json(404,{error:'Bulunamadı'});
    }catch(e){console.error(e.message);return json(502,{error:e.message});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const base=publicBase(), port=Number(process.env.PORT||10000);
  const server=createServer({base});
  server.listen(port,'0.0.0.0',()=>console.log(`Hazır: ${base}/manifest.json`));
  process.on('SIGTERM',()=>server.close());
}
