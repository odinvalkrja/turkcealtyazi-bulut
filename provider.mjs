import {load} from 'cheerio';
import {unzipSync} from 'fflate';
import {createExtractorFromData} from 'node-unrar-js';
const ORIGIN='https://turkcealtyazi.org';
const LIMIT=16*1024*1024;
export class Site {
  cookies=new Map();
  async get(path,options={}) {
    let url=new URL(path,ORIGIN);
    for(let i=0;i<6;i++) {
      if(url.origin!==ORIGIN) throw Error('Beklenmeyen site yönlendirmesi.');
      const r=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0 (compatible; LocalSubtitleAddon/1.0)',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});
      for(const c of r.headers.getSetCookie()) {const p=c.split(';')[0], n=p.indexOf('=');this.cookies.set(p.slice(0,n),p.slice(n+1));}
      if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),url);if([301,302,303].includes(r.status))options={};continue;}
      if(!r.ok) throw Error(`TürkçeAltyazı HTTP ${r.status}; site erişimi kısıtlamış olabilir.`);
      const chunks=[];let size=0;
      for await(const chunk of r.body){size+=chunk.length;if(size>LIMIT)throw Error('Dosya boyutu sınırı aşıldı.');chunks.push(chunk);}
      return {data:Buffer.concat(chunks),url:url.href};
    }
    throw Error('Çok fazla yönlendirme.');
  }
}
export function parseMovie(html) {
  const $=load(html), records=[];
  $('.altsonsez2').each((i,e)=>{
    const row=$(e), a=row.find('a[href^="/sub/"]').first(), path=a.attr('href');
    if(!row.find('.flagtr').length||!path||Number(row.find('.alcd').text().trim())!==1)return;
    const id=path.match(/^\/sub\/(\d+)\//)?.[1];
    if(id)records.push({id,path,release:row.find('.ripdiv').text().replace(/\s+/g,' ').trim(),fps:row.find('.alfps').text().trim()});
  });
  return [...new Map(records.map(r=>[r.id,r])).values()];
}
export async function findMovie(imdb) {
  if(!/^tt\d{7,10}$/.test(imdb))return [];
  const site=new Site();let page;
  try { page=await site.get(`/mov/${imdb.slice(2)}/film.html`); }
  catch (directError) {
    try { page=await site.get(`/find.php?cat=sub&find=${imdb}`); }
    catch (searchError) { throw Error(`Film sayfası: ${directError.message} Arama: ${searchError.message}`); }
  }
  const digits=imdb.slice(2), $=load(page.data.toString('utf8'));
  if(!new URL(page.url).pathname.startsWith(`/mov/${digits}/`)) {
    const link=$(`a[href^="/mov/${digits}/"]`).first().attr('href');
    if(!link)return [];
    page=await site.get(link);
  }
  return parseMovie(page.data.toString('utf8'));
}
export function decodeText(bytes) {
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1254').decode(bytes);}
}
export async function extractSubtitle(bytes) {
  let files=[];
  if(bytes[0]===80&&bytes[1]===75) {
    const extracted=unzipSync(bytes,{filter:file=>file.originalSize<=LIMIT&&/\.(srt|vtt)$/i.test(file.name)});
    files=Object.entries(extracted).map(([name,data])=>({name,data}));
  } else if(bytes.subarray(0,4).toString()==='Rar!') {
    const ex=await createExtractorFromData({data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
    const headers=[...ex.getFileList().fileHeaders];
    const names=headers.filter(f=>!f.flags.directory&&f.unpSize<=LIMIT&&/\.(srt|vtt)$/i.test(f.name)).map(f=>f.name);
    files=[...ex.extract({files:names}).files].map(f=>({name:f.fileHeader.name,data:f.extraction}));
  }else files=[{name:'subtitle.srt',data:bytes}];
  files=files.filter(f=>f.data).sort((a,b)=>b.data.length-a.data.length);
  if(!files.length)throw Error('Arşivde desteklenen SRT/VTT altyazı yok.');
  let text=decodeText(files[0].data).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text))throw Error('Geçerli altyazı dosyası bulunamadı.');
  if(!text.startsWith('WEBVTT'))text='WEBVTT\n\n'+text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');
  return text;
}
export async function download(path) {
  if(!/^\/sub\/\d+\/[a-zA-Z0-9_-]+\.html$/.test(path))throw Error('Geçersiz altyazı yolu.');
  const site=new Site(), page=await site.get(path), $=load(page.data.toString('utf8'));
  const form=$('form[action="/ind"]'), body=new URLSearchParams();
  form.find('input[name]').each((i,e)=>body.set($(e).attr('name'),$(e).val()));
  if(!body.get('altid')||!body.get('sidid'))throw Error('İndirme formu bulunamadı; site doğrulama istiyor olabilir.');
  const result=await site.get('/ind',{method:'POST',body,headers:{Referer:page.url}});
  return extractSubtitle(result.data);
}
