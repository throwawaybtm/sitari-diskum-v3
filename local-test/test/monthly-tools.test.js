'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFixtureStore}=require('../fixtures'),{completeTldPayload}=require('./tld-test-data');
test('new TLD ignores public destination input; admin assigns canonical PIC before notifying',()=>{
  const store=createFixtureStore(new Date('2026-10-30T00:00:00Z'));
  const code=store.handleMutation('registerTamuLuar',completeTldPayload()).data.kode_kunjungan;
  let d=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;
  assert.equal(d.visit.tujuan_bidang,'');assert.equal(d.visit.lo_nama,'');
  const act=(action,extra={})=>store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:d.workflow.version,action,...extra});
  assert.equal(act('notifyContact').success,false);
  const selected=act('destinations',{destinations:['Bidang Pengawasan Koperasi']});assert.equal(selected.success,true,selected.error);d=selected.data;
  assert.equal(d.visit.lo_nama,'Mery Sefina Simor, S.Kom.');assert.equal(act('notifyContact').success,true);
  assert.equal(act('destinations',{destinations:['Invalid']} ).success,false);
});
test('monthly report includes both guest types, excludes other months and numbers rows',()=>{
  const c=vm.createContext({document:{addEventListener(){}}});vm.runInContext(fs.readFileSync('Admin/Tools.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  const records=[{tanggal_kunjungan:'2026-10-02',ketua_nama:'Dua',keperluan:'Agenda 2'},{tanggal_kunjungan:'2026-09-30',ketua_nama:'Lama'},{tanggal_kunjungan:'2026-10-01',ketua_nama:'Satu',keperluan:'Agenda 1'}];
  const rows=c.monthlyGuestRows(records,'2026-10');assert.equal(rows.length,2);assert.equal(rows[0].nama,'Satu');assert.equal(rows[1].no,2);assert.equal(c.monthlyGuestRows(records,'2026-11').length,0);
});
test('report rendering keeps every row across image pages including long agendas',()=>{
  const drawn=[];const context={fillRect(){},strokeRect(){},fillText:text=>drawn.push(String(text)),measureText:text=>({width:String(text).length*10})};
  const c=vm.createContext({document:{addEventListener(){},createElement:()=>({getContext:()=>context})}});
  vm.runInContext(fs.readFileSync('Admin/Tools.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  const rows=Array.from({length:100},(_,i)=>({no:i+1,nama:'Tamu '+(i+1),agenda:'Agenda '+(i+1)}));rows[10].agenda='Pembahasan panjang '.repeat(300);
  const pages=c.buildMonthlyReportCanvases(rows,'2026-10');assert.ok(pages.length>2);assert.ok(drawn.includes('Tamu 1'));assert.ok(drawn.includes('Tamu 100'));assert.ok(drawn.includes('Agenda 100'));
});
test('completed documents are file rows with View and Download, and timestamps follow Jakarta format',()=>{
  const fields={};const c=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='visitDisposisi'?null:(fields[id]||={})},escapeHtml:v=>String(v??'')});
  vm.runInContext(fs.readFileSync('Admin/VisitModal.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  vm.runInContext("visitModalData={visit:{kode_kunjungan:'TLD'},workflow:{status:'Selesai'},archiveSources:[{name:'Daftar Hadir.pdf',url:'/local-doc/1'}]};visitModalTab=5;renderVisitWorkflow();",c);
  assert.match(fields.visitModalContent.innerHTML,/Daftar Hadir.pdf[^]*View[^]*Download/);assert.doesNotMatch(fields.visitModalContent.innerHTML,/visit-document-card/);
  assert.equal(c.formatVisitTimestamp('2026-10-30T17:05:00Z'),'31-10-2026 00:05');assert.equal(c.formatVisitTimestamp('30-10-2026 09:05:33'),'30-10-2026 09:05');assert.equal(c.formatVisitTimestamp('2026-10-30 14:25:00'),'30-10-2026 14:25');
});
test('confirmation notification stays disabled until the admin has saved a destination',()=>{
  const fields={};const c=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='visitDisposisi'?null:(fields[id]||={})},escapeHtml:v=>String(v??'')});
  vm.runInContext(fs.readFileSync('Admin/VisitModal.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  vm.runInContext("visitModalData={visit:{kode_kunjungan:'TLD'},workflow:{status:'Menunggu Konfirmasi'},stage:0,destinations:[]};renderVisitWorkflow();",c);
  assert.match(fields.visitModalContent.innerHTML,/onclick="submitVisitAction\('notifyContact'\)" disabled/);
  vm.runInContext("visitModalData.visit.tujuan_bidang='Bidang Pengawasan Koperasi';renderVisitWorkflow();",c);
  assert.doesNotMatch(fields.visitModalContent.innerHTML,/onclick="submitVisitAction\('notifyContact'\)" disabled/);
});
