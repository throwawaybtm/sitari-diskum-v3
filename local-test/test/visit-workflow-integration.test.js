'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureStore}=require('../fixtures');
const {completeTldPayload}=require('./tld-test-data');
const file={name:'scan.pdf',data:'data:application/pdf;base64,JVBERg=='};

test('a new TLD follows the full workflow through calendar QR attendance and paperless completion',()=>{
  const store=createFixtureStore(new Date('2026-10-27T12:00:00Z'));
  const registration=store.handleMutation('registerTamuLuar',completeTldPayload({tanggal_kunjungan:'2026-10-27',bawa_sppd:0}));
  const code=registration.data.kode_kunjungan;
  let data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;
  assert.equal(data.workflow.status,'Menunggu Konfirmasi'); assert.equal(data.visit.bawa_sppd,true);
  const act=(action,extra={})=>{
    const res=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action,...extra});
    assert.equal(res.success,true,res.error); data=res.data; return data;
  };
  act('destinations',{destinations:['UPTD PLUT KUMKM']}); act('confirm'); act('disposisi',{file}); act('notify');
  assert.ok(data.workflow.notifications.every(item=>item.simulated));
  act('book',{booking:{ruangan_id:6001,tanggal:'2026-10-27',jam_mulai:'07:00',jam_selesai:'08:00'}});
  const agenda=store.responses.getRapatCalendar.data.find(item=>item.id===data.workflow.booking.id);
  assert.equal(agenda.kode_kunjungan,code);
  assert.equal(store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action:'arrival'}).success,false);
  assert.equal(store.handleMutation('submitPresensiRapat',{rapat_id:agenda.id,member_id:'ketua',kategori_peserta:'Tamu_Luar',jabatan:'Ketua Rombongan'}).success,true);
  data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;
  assert.equal(data.attendance.length,1);
  act('arrival'); act('evidence',{files:{foto:file}}); act('finish',{note:'Kegiatan selesai.'});
  assert.equal(data.workflow.status,'Selesai');
  assert.notEqual(agenda.status,'Selesai','visit completion does not close the agenda before E-notula');
  assert.ok(store.getDocument(data.workflow.files.absen.url.split('/').pop()).buffer.length>0);
  assert.equal(store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action:'confirm'}).success,false);
  assert.equal(store.handleMutation('submitPresensiRapat',{rapat_id:agenda.id,nama:'Late'}).success,false);
});

test('QR and manual attendance share the registered roster, deduplicate check-ins and freeze after validation',()=>{
  let now=new Date('2026-10-27T00:00:00Z');const store=createFixtureStore(()=>now);
  const code=store.handleMutation('registerTamuLuar',completeTldPayload({ketua_nama:'Ketua Valid',pengikut_list:'Anggota A, S.E.\nAnggota B, S.Kom.',jumlah_orang:3,tanggal_kunjungan:'2026-10-27'})).data.kode_kunjungan;
  let data=store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data;
  for(const [action,extra] of [['destinations',{destinations:['UPTD PLUT KUMKM']}],['confirm',{}],['disposisi',{file}],['notify',{}],['book',{booking:{ruangan_id:6001,tanggal:'2026-10-27',jam_mulai:'07:00',jam_selesai:'08:00'}}]]) {
    const res=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action,...extra});assert.equal(res.success,true,res.error);data=res.data;
  }
  const id=data.workflow.booking.id;
  const roster=store.handleMutation('getVisitAttendanceRoster',{rapat_id:id}).data.roster;
  assert.deepEqual(Array.from(roster,m=>m.nama),['Ketua Valid','Anggota A, S.E.','Anggota B, S.Kom.']);
  assert.equal(store.handleMutation('submitPresensiRapat',{rapat_id:id,nama:'Unknown'}).success,false);
  for(let i=0;i<2;i++)assert.equal(store.handleMutation('submitPresensiRapat',{rapat_id:id,member_id:'ketua',nama:'Forged',jabatan:'Ketua Rombongan'}).success,true);
  assert.equal(store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data.attendance.length,1);
  assert.equal(store.handleMutation('submitManualVisitAttendance',{rapat_id:id,member_ids:[roster[1].id,'unknown']}).success,false);
  const saved=store.handleMutation('submitManualVisitAttendance',{rapat_id:id,member_ids:[roster[1].id,roster[2].id]});
  assert.equal(saved.success,true,saved.error);assert.equal(saved.data.attendance.length,3);
  assert.equal(saved.data.attendance[0].nama,'Ketua Valid');assert.equal(saved.data.attendance[1].source,'Admin');
  assert.ok(saved.data.roster.every(m=>m.attended));
  assert.equal(store.responses.getRapatCalendar.data.find(m=>String(m.id)===String(id)).manual_attendance,true);
  const qrAfterManual=store.handleMutation('submitPresensiRapat',{rapat_id:id,member_id:'ketua'});
  assert.equal(qrAfterManual.success,false);assert.match(qrAfterManual.error,/manual/i);
  now=new Date('2026-10-27T12:00:00Z');
  const validated=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:data.workflow.version,action:'arrival'});
  assert.equal(validated.success,true,validated.error);
  assert.equal(store.handleMutation('getVisitAttendanceRoster',{rapat_id:id}).data.locked,true);
  assert.equal(store.handleMutation('submitManualVisitAttendance',{rapat_id:id,member_ids:['ketua']}).success,false);
});

test('visit room conflicts and capacity are checked without advancing the status',()=>{
  const store=createFixtureStore(new Date('2026-10-27T12:00:00Z'));
  const code=store.handleMutation('registerTamuLuar',completeTldPayload({tanggal_kunjungan:'2026-10-27',jumlah_orang:11})).data.kode_kunjungan;
  let version=0;
  for(const [action,extra] of [['destinations',{destinations:['UPTD PLUT KUMKM']}],['confirm',{}],['disposisi',{file}],['notify',{}]]) {
    const res=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version:version++,action,...extra}); assert.equal(res.success,true,res.error);
  }
  const booking={ruangan_id:6002,tanggal:'2026-10-27',jam_mulai:'09:00',jam_selesai:'10:00'};
  const tooSmall=store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version,action:'book',booking});
  assert.match(tooSmall.error,/kapasitas/);
  booking.ruangan_id=6001;
  const meeting=store.responses.getRapatCalendar.data.find(item=>item.tanggal==='2026-10-27');
  Object.assign(booking,{ruangan_id:meeting.ruangan_id,jam_mulai:meeting.jam_mulai,jam_selesai:meeting.jam_selesai});
  assert.match(store.handleMutation('saveVisitWorkflow',{kode_kunjungan:code,version,action:'book',booking}).error,/digunakan/);
  assert.equal(store.handleMutation('getVisitWorkflow',{kode_kunjungan:code}).data.workflow.status,'Sudah Disposisi');
});
