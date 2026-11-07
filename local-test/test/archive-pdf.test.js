'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const PDFLib=require('../vendor/pdf-lib.min.js');
function load(){const c=vm.createContext({PDFLib,Uint8Array,ArrayBuffer,atob,document:{}});const file=fs.readFileSync('Admin/ArchiveClient.html','utf8');vm.runInContext(file.match(/<script>([^]*?)<\/script>/)[1],c);return c;}
test('archive preserves every PDF source page and includes the summary',async()=>{
  const c=load();const input=await PDFLib.PDFDocument.create();input.addPage();input.addPage();const bytes=await input.save();
  const output=await c.mergeVisitArchivePdf_(bytes,[{name:'one'},{name:'two'}],async()=>({mime:'application/pdf',base64:Buffer.from(bytes).toString('base64')}));
  const pdf=await PDFLib.PDFDocument.load(output);assert.equal(pdf.getPageCount(),6);
});
test('archive fails clearly instead of silently skipping an unreadable source',async()=>{
  const c=load(),input=await PDFLib.PDFDocument.create();input.addPage();
  await assert.rejects(c.mergeVisitArchivePdf_(await input.save(),[{name:'Rusak.pdf'}],async()=>({mime:'application/pdf',base64:'YmFk'})),/Rusak.pdf/);
});

test('archive downloads two sources concurrently, preserves source order and reports progress',async()=>{
  const c=load(),summary=await PDFLib.PDFDocument.create();summary.addPage([100,100]);
  const docs=[];for(let i=0;i<3;i++){const pdf=await PDFLib.PDFDocument.create();pdf.addPage([200+i*10,300]);docs.push(Buffer.from(await pdf.save()).toString('base64'));}
  const pending=[],progress=[];let active=0,max=0;
  const result=c.mergeVisitArchivePdf_(await summary.save(),docs.map((_,i)=>({name:'file'+i})),i=>new Promise(resolve=>{active++;max=Math.max(max,active);pending.push({i,done(){active--;resolve({mime:'application/pdf',base64:docs[i]});}});}),n=>progress.push(n));
  // Wait until the summary has been parsed and downloads have started.
  for(let i=0;i<30&&!pending.length;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,2,'two downloads should start without waiting for the first');
  pending.find(p=>p.i===1).done();for(let i=0;i<30&&pending.length<3;i++)await new Promise(resolve=>setImmediate(resolve));
  pending.find(p=>p.i===2).done();pending.find(p=>p.i===0).done();
  const pdf=await PDFLib.PDFDocument.load(await result);assert.equal(max,2);assert.deepEqual(pdf.getPages().map(p=>p.getWidth()),[100,200,210,220]);assert.equal(progress.at(-1),3);
});

test('a late archive download cannot change progress after another source fails',async()=>{
  const c=load(),summary=await PDFLib.PDFDocument.create();summary.addPage();const pending=[],progress=[];
  const result=c.mergeVisitArchivePdf_(await summary.save(),[{name:'Failed'},{name:'Slow'}],()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),n=>progress.push(n));
  for(let i=0;i<30&&pending.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,2);const rejected=assert.rejects(result,/Failed/);pending[0].reject(new Error('Offline'));await rejected;
  pending[1].resolve({mime:'application/pdf',base64:''});await new Promise(resolve=>setImmediate(resolve));assert.equal(progress.length,0);
});
