'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function loadFunctions(file,names,c){const html=fs.readFileSync(file,'utf8');for(const name of names){const source=html.match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'))?.[0];if(source)vm.runInContext(source,c);}}
class Reader {readAsDataURL(){this.result='data:application/octet-stream;base64,JVBERg==';this.onload();}}

test('admin phone documents normalize generic MIME for upload and local preview',async()=>{
  const file=new Blob(['%PDF'],{type:''});file.name='surat.pdf';const fields={upload:{files:[file]},uploadPreview:{},uploadOpen:{}};let previewType;
  const c=vm.createContext({Blob,FileReader:Reader,document:{getElementById:id=>fields[id]},URL:{createObjectURL:blob=>{previewType=blob.type;return 'blob:test';}},showToast(){assert.fail('valid PDF rejected');},visitDocumentPreview:()=>'<iframe></iframe>',visitPreviewUrls:{}});
  loadFunctions('Admin/VisitModal.html',['visitFileMime','readVisitFile','previewVisitSelection'],c);
  const result=await c.readVisitFile('upload');assert.match(result.data,/^data:application\/pdf;base64,/);
  c.previewVisitSelection({...fields.upload,id:'upload'});assert.equal(previewType,'application/pdf');
  fields.upload.files=[{name:'fake.pdf',type:'text/html',size:10}];await assert.rejects(c.readVisitFile('upload'),/PDF/);
});

test('E-notula phone uploads send a supported MIME header when the provider omits it',async()=>{
  let sent;const input={files:[{name:'notula.pdf',type:'',size:10}],click(){}};
  const c=vm.createContext({FileReader:Reader,document:{createElement:()=>input},allRapatData:[{id:7,photos:[{url:'/photo'}]}],visitRpc:async(name,payload)=>{sent={name,payload};return {url:'/document.pdf'};},renderMeetingsList(){},showToast(type,title,message){if(type==='error')assert.fail(message);}});
  loadFunctions('Admin/VisitModal.html',['visitFileMime'],c);
  vm.runInContext(fs.readFileSync('Admin/ArchiveClient.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  await c.uploadAgendaNotula(7);await input.onchange();
  assert.equal(sent.name,'saveAgendaNotula');assert.match(sent.payload.file.data,/^data:application\/pdf;base64,/);
});
