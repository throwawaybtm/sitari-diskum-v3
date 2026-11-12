'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixtureStore}=require('../fixtures');
test('overdue agenda accepts E-notula, stays editable until locked, then blocks replacement',()=>{
  const store=createFixtureStore(new Date('2026-11-05T12:00:00Z'),{
    seed:{meetings:[{
      id:101,kode_rapat:'RPT-20261102-101',judul_rapat:'Rapat Evaluasi Internal',
      ruangan_id:6001,nama_ruangan:'Ruang Rapat Utama Diskum',
      tanggal:'2026-11-02',jam_mulai:'09:00',jam_selesai:'10:30',
      penyelenggara_bidang:'Sekretariat',pimpinan_rapat:'Adrial, S.K.M, M.K.M.',
      jumlah_peserta:5,agenda:'Evaluasi internal',status:'Terjadwal',photos:[]
    }]}
  });
  const meeting=store.responses.getRapatCalendar.data[0],file={name:'notula.pdf',data:'data:application/pdf;base64,JVBERg=='};
  assert.notEqual(meeting.status,'Selesai');
  assert.equal(store.handleMutation('saveAgendaNotula',{rapat_id:meeting.id,file}).success,false);
  const photo=store.handleMutation('saveAgendaPhotos',{rapat_id:meeting.id,files:[{name:'foto.jpg',data:'data:image/jpeg;base64,/9j/2Q=='}]});assert.equal(photo.success,true,photo.error);assert.notEqual(meeting.status,'Selesai');
  const saved=store.handleMutation('saveAgendaNotula',{rapat_id:meeting.id,file});assert.equal(saved.success,true,saved.error);assert.equal(meeting.status,'Selesai');assert.ok(meeting.notula);
  assert.equal(store.handleMutation('saveAgendaNotula',{rapat_id:meeting.id,file}).success,true);
  assert.equal(store.handleMutation('lockAgendaRapat',{rapat_id:meeting.id}).success,true);
  assert.equal(store.handleMutation('saveAgendaNotula',{rapat_id:meeting.id,file}).success,false);
});
