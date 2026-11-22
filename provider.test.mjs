import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {parseMovie,extractSubtitle,decodeText} from './provider.mjs';
test('Türkçe ve tek CD filtreleri',()=>{
 const row=(id,flag,cd)=>`<div class="altsonsez2"><a href="/sub/${id}/film.html"></a><span class="${flag}"></span><div class="alcd">${cd}</div><div class="ripdiv"> BluRay </div></div>`;
 assert.deepEqual(parseMovie(row(1,'flagtr',1)+row(2,'flagen',1)+row(3,'flagtr',2)).map(x=>x.id),['1']);
});
test('ZIP, Türkçe UTF-8 ve VTT dönüşümü',async()=>{
 const zip=Buffer.from(zipSync({'film.srt':strToU8('1\r\n00:00:01,000 --> 00:00:03,000\r\nİyi akşamlar.\r\n')}));
 const result=await extractSubtitle(zip);assert.match(result,/^WEBVTT/);assert.match(result,/00:00:01\.000/);assert.match(result,/İyi akşamlar/);
});
test('Windows Türkçe karakterler',()=>assert.equal(decodeText(Buffer.from([0xdd,0xfe,0xf0])),'İşğ'));
test('HTML hata sayfası altyazı olarak sunulmaz',async()=>assert.rejects(()=>extractSubtitle(Buffer.from('<html>Doğrulama gerekli</html>'))));
