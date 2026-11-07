'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function model(){const c=vm.createContext({});for(const file of ['VisitWorkflow.js','MeetingRooms.js','AgendaSearch.html']){const p=path.join(__dirname,'../../Admin',file);if(fs.existsSync(p))vm.runInContext(fs.readFileSync(p,'utf8').replace(/<\/?script>/g,''),c);}return c;}
const visit={tujuan_bidang:'Bidang Pengawasan Koperasi',tipe_tamu:'luar_daerah',tanggal_kunjungan:'2026-11-01',jam_kunjungan:'09:00'};
test('confirmation reschedule invalidates only contact notification and does not notify PICs',()=>{
  const m=model(),state=m.newVisitWorkflow_(visit);state.contactNotification={success:true};
  const env={now:'2026-10-30T00:00:00Z',actor:'Admin',reschedule:s=>s,notifyContact:()=>({success:true,at:'now'})};
  const next=m.applyVisitWorkflow_(visit,state,{version:0,action:'reschedule',schedule:{tanggal:'2026-11-02',jam:'13:30'}},env);
  assert.equal(next.schedule.tanggal,'2026-11-02');assert.equal(next.contactNotification,null);assert.equal(next.notifications.length,0);
  const sent=m.applyVisitWorkflow_(visit,next,{version:1,action:'notifyContact'},env);assert.equal(sent.contactNotification.success,true);assert.equal(sent.notifications.length,0);
});
test('completion requires note, photo and actual attendance, then directly finishes without signatures',()=>{
  const m=model(),state={...m.newVisitWorkflow_(visit),status:'Kelola SPPD',files:{foto:{url:'/photo'}}};
  const env={now:'now',actor:'Admin',attendance:[{nama:'A',jabatan:'Ketua'}],generateAttendance:()=>({url:'/attendance.pdf',mime:'application/pdf'})};
  assert.throws(()=>m.applyVisitWorkflow_(visit,state,{version:0,action:'finish',note:''},env),/catatan/i);
  assert.throws(()=>m.applyVisitWorkflow_(visit,state,{version:0,action:'finish',note:'a'.repeat(301)},env),/300/);
  const next=m.applyVisitWorkflow_(visit,state,{version:0,action:'finish',note:'Pembahasan selesai.'},env);
  assert.equal(next.status,'Selesai');assert.equal(next.note,'Pembahasan selesai.');assert.equal(next.files.absen.url,'/attendance.pdf');assert.equal(m.visitWorkflowStage_(next),5);
  assert.equal(m.visitWorkflowStage_({...state,exported:{at:'legacy'}}),4);
});
test('PLUT has no capacity limit while existing room limits still apply',()=>{
  const m=model();const rooms=m.normalizeMeetingRooms_([{id:99,nama_ruangan:'Gedung PLUT',kapasitas:''}]);
  assert.equal(rooms.length,1);assert.equal(rooms[0].kapasitas,null);
  const booking={ruangan_id:99,tanggal:'2026-11-01',jam_mulai:'09:00',jam_selesai:'10:00'};
  assert.equal(m.validateVisitBooking_(booking,{jumlah_orang:200},rooms,[]).ruangan_id,99);
});
test('keyword commas mean OR while date is an additional exact filter',()=>{
  const m=model(),rows=[{instansi:'Koperasi',tanggal:'2026-11-01'},{instansi:'Usaha Mikro',tanggal:'2026-11-02'},{instansi:'Sekretariat',tanggal:'2026-11-01'}];
  assert.equal(typeof m.filterAgendaRecords_,'function');
  assert.equal(m.filterAgendaRecords_(rows,'koperasi, mikro','').length,2);
  assert.equal(m.filterAgendaRecords_(rows,'koperasi, mikro','2026-11-02')[0].instansi,'Usaha Mikro');
  assert.equal(m.filterAgendaRecords_(rows,' , ','2026-11-01').length,2);
});
