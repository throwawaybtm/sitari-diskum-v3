'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFixtureStore}=require('../fixtures');
test('deployment preview has twenty visits and usable agenda attendance for SPPD completion',()=>{
  const store=createFixtureStore(new Date('2026-10-30T12:00:00Z'),{deploymentPreview:true});
  const rows=store.responses.getTamuList.data;assert.equal(rows.length,20);
  assert.ok(rows.some(v=>v.instansi==='Dinas Koperasi Kabupaten Purnama'));
  const v=rows.find(v=>v.status_kunjungan==='Kelola SPPD');const data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:v.kode_kunjungan}).data;
  assert.ok(data.workflow.booking);assert.equal(data.attendance.length,3);assert.ok(data.workflow.files.foto);
  const result=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:v.kode_kunjungan,version:data.workflow.version,action:'finish',note:'Koordinasi telah selesai.'});
  assert.equal(result.success,true,result.error);assert.equal(result.data.workflow.status,'Selesai');
});
test('finish enables for a selected photo plus note and actual attendance',()=>{
  const fields={visitNote:{value:'Rangkuman rapat'},visitNoteCount:{},visitFoto:{files:[{name:'foto.png'}]},visitFinishHint:{}};const button={disabled:true};
  const c=vm.createContext({document:{addEventListener(){},getElementById:id=>fields[id],querySelector:()=>button}});
  vm.runInContext(fs.readFileSync('Admin/VisitModal.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  vm.runInContext("visitModalData={workflow:{files:{}},attendance:[{nama:'Hadir'}]};",c);c.updateVisitFinishButton();assert.equal(button.disabled,false);
  fields.visitNote.value='';c.updateVisitFinishButton();assert.equal(button.disabled,true);
});
test('retired room is omitted and PLUT is renamed without changing its ID',()=>{
  const {normalize}=require('../meeting-rooms');const rooms=normalize([{id:4,nama_ruangan:'Ruangan Bidang'},{id:5,nama_ruangan:'Gedung PLUT'}]);
  assert.deepEqual(Array.from(rooms,r=>r.nama_ruangan),['Ruangan Rapat UPTD PLUT KUMKM']);assert.ok(rooms.every(r=>r.kapasitas===null));assert.equal(rooms[0].id,5);
});

test('room renames preserve IDs for both old and current names',()=>{
  const {normalize}=require('../meeting-rooms');
  const names=['Ruang Konsultasi Koperasi & UMKM','Ruangan Bidang Koperasi & UMKM','Gedung PLUT','Ruangan Rapat UPTD PLUT KUMKM'];
  const rooms=normalize(names.map((nama_ruangan,id)=>({id,nama_ruangan})));
  assert.deepEqual(Array.from(rooms,r=>[r.id,r.nama_ruangan]),[
    [0,'Ruangan Bidang Koperasi & UMKM'],[1,'Ruangan Bidang Koperasi & UMKM'],
    [2,'Ruangan Rapat UPTD PLUT KUMKM'],[3,'Ruangan Rapat UPTD PLUT KUMKM']
  ]);
});
test('finish saves a selected photo then completes using the updated version and note',async()=>{
  const calls=[],fields={visitNote:{value:'Rangkuman rapat'},visitModalError:{}};
  const c=vm.createContext({document:{addEventListener(){},querySelectorAll:()=>[],getElementById:id=>fields[id]},applyVisitUpdate(){},showToast(){},
    callBackend:(name,args,success)=>{calls.push(args[0]);success({success:true,data:{visit:{kode_kunjungan:'TLD'},workflow:{status:args[0].action==='finish'?'Selesai':'Kelola SPPD',version:args[0].version+1},stage:args[0].action==='finish'?5:4}});}});
  vm.runInContext(fs.readFileSync('Admin/VisitModal.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  vm.runInContext("visitModalData={visit:{kode_kunjungan:'TLD'},workflow:{version:7,status:'Kelola SPPD'}};readVisitFile=async()=>({name:'foto.png',data:'image'});renderVisitWorkflow=()=>{};",c);
  await c.submitVisitAction('finish');assert.deepEqual(calls.map(a=>a.action),['evidence','finish']);assert.equal(calls[1].version,8);assert.equal(calls[1].note,'Rangkuman rapat');assert.equal(vm.runInContext('visitModalTab',c),5);
});
test('confirmation renders side-by-side schedule and notify before the full-width confirmation',()=>{
  const fields={};const c=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='visitDisposisi'?null:(fields[id]||={})},escapeHtml:v=>String(v??'')});
  vm.runInContext(fs.readFileSync('Admin/VisitModal.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  vm.runInContext("visitModalData={visit:{kode_kunjungan:'TLD'},workflow:{status:'Menunggu Konfirmasi',files:{}},stage:0};renderVisitWorkflow();",c);
  const html=fields.visitModalContent.innerHTML;assert.match(html,/visit-confirm-actions[^]*Ganti Jadwal[^]*Kirim Notifikasi Narahubung[^]*<\/div>[^]*submitVisitAction\('confirm'\)/);
});
