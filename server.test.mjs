import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer,publicBase} from './server.mjs';
test('Genel HTTPS adresi zorunludur',()=>{
 assert.throws(()=>publicBase({}));assert.throws(()=>publicBase({PUBLIC_URL:'http://localhost:7000'}));
 assert.equal(publicBase({RENDER_EXTERNAL_URL:'https://example.onrender.com'}),'https://example.onrender.com');
});
test('TV adresleri HTTPS; yeniden başlamada indirme çalışır; dış kaynak engellenir',async()=>{
 let source;
 const options={base:'https://example.onrender.com',find:async()=>[{id:'123',path:'/sub/123/movie.html',release:'BluRay'}],fetchSubtitle:async p=>{source=p;return 'WEBVTT\n\n';}};
 let server=createServer(options);server.listen(0,'127.0.0.1');await once(server,'listening');
 let address=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(address+'/subtitles/movie/tt0133093.json');assert.equal(response.headers.get('access-control-allow-origin'),'*');
 const data=await response.json();assert.match(data.subtitles[0].url,/^https:\/\/example.onrender.com\//);
 await new Promise(r=>server.close(r));
 server=createServer(options);server.listen(0,'127.0.0.1');await once(server,'listening');address=`http://127.0.0.1:${server.address().port}`;
 try{
   const subtitle=await fetch(address+new URL(data.subtitles[0].url).pathname);assert.equal(subtitle.status,200);assert.equal(source,'/sub/123/movie.html');
   const invalid=await fetch(address+'/subtitle/'+Buffer.from('https://example.com/private').toString('base64url')+'.vtt');assert.equal(invalid.status,400);
 }finally{await new Promise(r=>server.close(r));}
});
