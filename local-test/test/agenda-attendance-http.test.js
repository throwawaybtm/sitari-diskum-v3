'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalTestServer}=require('../server');
test('HTTP attendance viewer shows an admin backfill on its agenda only and supports empty visits',async()=>{
 const server=createLocalTestServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const rpc=async(name,body={})=>(await fetch(base+'/api/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 try {
  const meetings=(await rpc('getRapatCalendar')).data,meeting=meetings.find(row=>!row.kode_kunjungan&&row.status==='Terjadwal'&&!row.notula&&row.tanggal<=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'}).format(new Date())),other=meetings.find(row=>String(row.id)!==String(meeting.id));
  const result=await rpc('submitAdminPresensiRapat',{rapat_id:meeting.id,nama:'Attendance Viewer Test',jam_kehadiran:'14:25'});assert.equal(result.success,true,result.error);
  const view=await rpc('getAgendaAttendance',{rapat_id:meeting.id});assert.equal(view.success,true,view.error);const saved=view.data.attendance.find(row=>row.nama==='Attendance Viewer Test');assert.ok(saved);assert.equal(saved.jam,'14:25');assert.equal(saved.tanggal,meeting.tanggal.split('-').reverse().join('-'));
  assert.equal((await rpc('submitPresensiRapat',{rapat_id:meeting.id,nama:'QR Viewer Test'})).success,true);
  const qr=(await rpc('getAgendaAttendance',{rapat_id:meeting.id})).data.attendance.find(row=>row.nama==='QR Viewer Test');assert.match(qr.tanggal,/^\d{2}-\d{2}-\d{4}$/);assert.match(qr.jam,/^\d{2}:\d{2}$/);
  const otherView=await rpc('getAgendaAttendance',{rapat_id:other.id});assert.equal(otherView.success,true);assert.ok(otherView.data.attendance.every(row=>row.nama!=='Attendance Viewer Test'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
