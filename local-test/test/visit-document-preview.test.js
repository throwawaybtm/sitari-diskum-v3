'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../Admin/VisitModal.html'),'utf8');
function load(extra={}) {
  const fields={};const c=vm.createContext({document:{addEventListener(){},querySelectorAll:()=>[],getElementById:id=>fields[id]||={hidden:true},createElement(tag){const attributes={};return {setAttribute:(name,value)=>attributes[name]=value,get outerHTML(){const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');return '<'+tag+Object.entries(attributes).map(([name,value])=>' '+name+'="'+escape(value)+'"').join('')+'>'+(tag==='img'?'':'</'+tag+'>');}};}},escapeHtml:v=>String(v??''),loadAllDashboard(){},showToast(){},...extra});
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1],c);return {c,fields};
}
test('GAS inline modal script contains no literal embedded-media tags and keeps preview attributes escaped',()=>{
  const script=html.match(/<script>([^]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /<(?:iframe|img)\b/i);
  const {c}=load();
  const preview=c.visitDocumentPreview({url:'/local-doc/1',mime:'application/pdf'},'Nama "dokumen" <uji>');
  assert.match(preview,/title="Pratinjau Nama &quot;dokumen&quot; &lt;uji>/);
  assert.match(preview,/loading="lazy"/);
  assert.equal(typeof c.openVisitWorkflow,'function');
});
test('saved images, PDFs and Drive documents render inside square preview cards',()=>{
  const {c}=load();
  assert.match(c.visitFileLink({url:'/local-doc/1',mime:'image/png',name:'Foto.png'},'Foto Kegiatan'),/visit-document-card[^]*<img/);
  assert.match(c.visitFileLink({url:'/local-doc/2',mime:'application/pdf'},'Daftar Hadir'),/visit-document-card[^]*<iframe/);
  assert.match(c.visitFileLink({url:'https://drive.google.com/file/d/abc123/view'},'Disposisi'),/https:\/\/drive.google.com\/file\/d\/abc123\/preview/);
  assert.equal(c.visitFileLink({url:'javascript:alert(1)'},'Invalid'),'');
  assert.match(c.visitUpload('testFile','Dokumen'),/testFilePreview/);
  assert.match(html,/aspect-ratio:\s*1\s*\/\s*1/);
});
