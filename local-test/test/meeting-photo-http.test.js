'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalTestServer}=require('../server');
test('local HTTP booking rejects overlaps and requires internal photos before E-notula completion',async()=>{
 const server=createLocalTestServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const rpc=async(name,body={})=>{const response=await fetch(base+'/api/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.json();};
 try{
  const room=(await rpc('getMasterData')).data.ruangan[0],payload={judul:'Uji Waktu 24 Jam',tanggal:'2026-11-05',ruangan:room.id+'|'+room.nama_ruangan,jam_mulai:'14:00',jam_selesai:'16:00',bidang:'Sekretariat',pimpinan:'Pimpinan',agenda:'Pengujian lokal'};
  assert.equal((await rpc('simpanJadwalRapat',payload)).success,true);
  assert.equal((await rpc('simpanJadwalRapat',payload)).success,false);
  const meeting=(await rpc('getRapatCalendar')).data.find(row=>row.judul_rapat===payload.judul);
  assert.equal(meeting.jam_mulai,'14:00');assert.equal(meeting.jam_selesai,'16:00');
  const file={name:'catatan.pdf',data:'data:application/pdf;base64,JVBERg=='};
  assert.equal((await rpc('saveAgendaNotula',{rapat_id:meeting.id,file})).success,false);
  const photos=await rpc('saveAgendaPhotos',{rapat_id:meeting.id,files:[{name:'foto.jpg',data:'data:image/jpeg;base64,/9j/2Q=='}]});assert.equal(photos.success,true,photos.error);
  assert.equal((await rpc('getAgendaPhotoDocument',{rapat_id:meeting.id,index:0})).data.mime,'image/jpeg');
  assert.equal((await rpc('saveAgendaNotula',{rapat_id:meeting.id,file})).success,true);
  assert.equal((await rpc('getRapatCalendar')).data.find(row=>row.id===meeting.id).status,'Selesai');
  assert.equal((await rpc('saveAgendaPhotos',{rapat_id:meeting.id,files:[{name:'foto.jpg',data:'data:image/jpeg;base64,/9j/2Q=='}]})).success,true);
  assert.equal((await rpc('lockAgendaRapat',{rapat_id:meeting.id})).success,true);
  assert.equal((await rpc('saveAgendaPhotos',{rapat_id:meeting.id,files:[{name:'foto.jpg',data:'data:image/jpeg;base64,/9j/2Q=='}]})).success,false);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Admin and all public form routes share phone defaults without a physical-screen override',async()=>{
 const server=createLocalTestServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try {for(const route of ['/','/tamu-luar','/tamu-fo','/?page=presensi']){
  const response=await fetch(base+route),html=await response.text();assert.equal(response.status,200);
  assert.match(html,/id="si-tari-mobile-base"/);assert.doesNotMatch(html,/phoneViewportFit|window\.screen\.width|<\?!=/);
 }}finally{await new Promise(resolve=>server.close(resolve));}
});
