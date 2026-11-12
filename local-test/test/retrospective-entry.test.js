'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFixtureStore}=require('../fixtures'),{completeTldPayload}=require('./tld-test-data');
const file={name:'scan.pdf',data:'data:application/pdf;base64,JVBERg=='};
test('normal workflow supports entry days after the activity without a separate mode',()=>{
  const store=createFixtureStore(new Date('2026-11-05T03:00:00Z'));
  const code=store.handleMutation('registerTamuLuar',completeTldPayload({tanggal_kunjungan:'2026-11-05'})).data.kode_kunjungan;
  let data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;
  const act=(action,extra={})=>{const res=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action,...extra});assert.equal(res.success,true,res.error);data=res.data;};
  act('destinations',{destinations:['UPTD PLUT KUMKM']});act('confirm');act('disposisi',{file});act('notify');
  act('book',{booking:{ruangan_id:6001,tanggal:'2026-11-03',jam_mulai:'09:00',jam_selesai:'10:00'}});
  assert.equal(data.visit.tanggal_kunjungan,'2026-11-03');assert.equal(data.visit.jam_kunjungan,'09:00');assert.equal(data.workflow.retrospective,undefined);
  const id=data.workflow.booking.id;assert.equal(store.handleMutation('saveAgendaNotula',{rapat_id:id,file}).success,true);
  assert.equal(store.handleMutation('submitPresensiRapat',{rapat_id:id,member_id:'ketua'}).success,false);
  const attendance=store.handleMutation('submitManualVisitAttendance',{rapat_id:id,member_ids:['ketua'],member_jobs:{ketua:'Ketua Tim'}});assert.equal(attendance.success,true,attendance.error);
  data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;assert.equal(data.attendance[0].jabatan,'Ketua Tim');
  act('arrival');act('evidence',{files:{foto:file}});act('finish',{note:'Hasil kegiatan telah dicatat.'});assert.equal(data.workflow.status,'Selesai');
  assert.ok(store.getDocument(data.workflow.files.absen.url.split('/').pop()).buffer.toString('latin1').includes('03-11-2026'));
  assert.equal(store.handleMutation('submitManualVisitAttendance',{rapat_id:id,member_ids:['anggota-1']}).success,false);
});
test('booking has no Susulan choice and attendance display omits recording timestamps',()=>{
  const html=fs.readFileSync('Admin/VisitModal.html','utf8');assert.doesNotMatch(html,/visitRetrospective|toggleRetrospectiveVisit|Pencatatan Susulan|pencatatan susulan/);
  assert.doesNotMatch(html,/<th>Waktu Presensi<\/th>/);
});
test('late admin attendance remains available after agenda completion',()=>{
  const c=vm.createContext({});vm.runInContext(fs.readFileSync('Admin/MeetingRooms.js','utf8'),c);
  const meeting={tanggal:'2026-11-01',status:'Selesai'},now=new Date('2026-11-03T00:00:00Z');
  assert.equal(c.attendanceAvailability_(meeting,now).open,false);assert.equal(c.adminAttendanceAvailability_(meeting,now).open,true);
  assert.equal(c.adminAttendanceAvailability_({...meeting,status:'Dibatalkan'},now).open,false);
});
