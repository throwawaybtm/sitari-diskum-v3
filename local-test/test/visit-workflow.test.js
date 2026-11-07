'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin/VisitWorkflow.js'), 'utf8'), context);
  return context;
}
const visitor = {kode_kunjungan:'TLD-27102026-001', tipe_tamu:'luar_daerah', tujuan_bidang:'Bidang Pengawasan Koperasi', status_kunjungan:'Menunggu Konfirmasi'};
const file = {name:'scan.pdf',data:'data:application/pdf;base64,JVBERg=='};
test('workflow enforces each step, keeps acknowledgement status, and finishes read-only', () => {
  const model=load(); let state=model.newVisitWorkflow_(visitor);
  const env={now:'2026-10-27T12:00:00Z',actor:'Admin',saveFile: f=>({name:f.name,url:'/doc/test'}),
    notify:()=>[{pic:'PIC',success:true,simulated:true}], recipients:['PIC'],
    book:()=>({id:55,tanggal:'2026-10-27',jam_mulai:'09:00',jam_selesai:'10:00'}),attendance:[{nama:'Tamu'}],generateAttendance:()=>({url:'/attendance.pdf'})};
  const act=(action,extra={})=> {state=model.applyVisitWorkflow_(visitor,state,{version:state.version,action,...extra},env);};
  assert.throws(()=>act('disposisi',{file}),/konfirmasi/i);
  act('confirm'); assert.equal(state.status,'Menunggu Konfirmasi'); assert.equal(model.visitWorkflowStage_(state),1);
  assert.throws(()=>act('confirm'),/tahap|sudah/i);
  act('disposisi',{file}); assert.equal(state.status,'Sudah Disposisi');
  assert.throws(()=>act('book'),/notifikasi/i);
  act('notify'); act('book'); assert.equal(state.status,'Menunggu Kedatangan');
  act('arrival'); assert.equal(state.status,'Kelola SPPD');
  assert.throws(()=>act('finish',{note:'Rangkuman'}),/foto/i);
  act('evidence',{files:{foto:file}}); act('finish',{note:'Pembahasan selesai.'});
  assert.equal(state.status,'Selesai');assert.ok(state.files.absen);
  assert.throws(()=>act('signed',{file}),/selesai|baca/i);
});
test('rejects stale versions, disabled FO, missing attendance, future arrivals and malformed files', () => {
  const model=load(); const state=model.newVisitWorkflow_(visitor);
  assert.throws(()=>model.applyVisitWorkflow_(visitor,state,{version:7,action:'confirm'},{}),/berubah|ulang/i);
  const fo={tipe_tamu:'dalam_daerah_fo'};
  assert.throws(()=>model.applyVisitWorkflow_(fo,model.newVisitWorkflow_(fo),{version:0,action:'confirm'},{}),/Non-SPPD/);
  for(const data of ['', 'data:text/html;base64,PHNjcmlwdD4=', 'data:application/pdf;base64,wrong']) {
    assert.throws(()=>model.validateVisitFile_({name:'test',data}),/dokumen|PDF|file/i);
  }
  assert.throws(()=>model.validateVisitFile_({name:'test',data:'data:application/pdf;base64,'+'A'.repeat(7*1024*1024)}),/5 MB/);
  const waiting={...state,status:'Menunggu Kedatangan',booking:{tanggal:'2030-01-01',jam_mulai:'09:00'}};
  assert.throws(()=>model.applyVisitWorkflow_(visitor,waiting,{version:0,action:'arrival'},{attendance:[],now:'2026-10-27T12:00:00Z'}),/presensi/i);
  assert.throws(()=>model.applyVisitWorkflow_(visitor,waiting,{version:0,action:'arrival'},{attendance:[{}],now:'2026-10-27T12:00:00Z'}),/waktu|berlangsung/i);
});

test('attendance stays open until the visit ends and cancelled agenda IDs are never reused',()=>{
  const model=load();
  const state={...model.newVisitWorkflow_(visitor),status:'Menunggu Kedatangan',booking:{id:1,tanggal:'2026-10-27',jam_mulai:'09:00',jam_selesai:'11:00'}};
  assert.throws(()=>model.applyVisitWorkflow_(visitor,state,{version:0,action:'arrival'},{attendance:[{}],now:'2026-10-27T02:01:00Z'}),/selesai|berlangsung/i);
  assert.equal(model.nextVisitAgendaId_([1,2,99]),100);
});

test('the modal close button is restored after a successful save',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../Admin/VisitModal.html'),'utf8');
  const close={disabled:false,isConnected:true}; const error={hidden:true};
  const context=vm.createContext({document:{addEventListener(){},querySelectorAll:()=>[close],getElementById:()=>error},
    callBackend:(name,args,success)=>success({success:true,data:{workflow:{version:1,status:'Menunggu Konfirmasi'},stage:1}}),loadAllDashboard(){},showToast(){}});
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1],context);
  vm.runInContext("visitModalData={visit:{kode_kunjungan:'TLD'},workflow:{version:0,status:'Menunggu Konfirmasi'}};renderVisitWorkflow=()=>{};",context);
  await context.submitVisitAction('confirm');
  assert.equal(close.disabled,false);
});
