'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
function model(){const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../../Admin/VisitWorkflow.js'),'utf8'),c);return c;}
test('roster includes ketua and one member per line, preserves degrees, and deduplicates ketua',()=>{
  const c=model();const roster=c.getVisitRoster_({ketua_nama:'Novirianti, A.Md.',pengikut_list:'1. Novirianti, A.Md.\n2. Dewi Astuti, S.E.\n3. Ilhami Kurnia Putri, S.Kom.'});
  assert.deepEqual(Array.from(roster,r=>r.nama),['Novirianti, A.Md.','Dewi Astuti, S.E.','Ilhami Kurnia Putri, S.Kom.']);
  assert.equal(roster[0].peran,'Ketua Rombongan');
});
test('visit attendance resolves canonical roster data and rejects unregistered names',()=>{
  const c=model(),visit={ketua_nama:'Ketua',pengikut_list:'Anggota A\nAnggota B',instansi:'Instansi Resmi'};
  const roster=c.getVisitRoster_(visit);
  const member=c.resolveVisitAttendee_(visit,{member_id:roster[1].id,nama:'Forged',nama_opd:'Forged'});
  assert.equal(member.nama,'Anggota A');assert.equal(member.nama_opd,'Instansi Resmi');
  assert.throws(()=>c.resolveVisitAttendee_(visit,{member_id:'unknown',nama:'Unknown'}),/daftar|rombongan/);
});
test('notification and booking buttons have no checkmark before success, then show disabled success states',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../Admin/VisitModal.html'),'utf8'),fields={};
  const c=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='visitDisposisi'?null:(fields[id]||={})},escapeHtml:v=>String(v??''),formatMeetingDate:v=>v});
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1],c);
  c.data={visit:{kode_kunjungan:'TLD',lo_nama:'PIC',tanggal_kunjungan:'2026-10-27',jam_kunjungan:'09:00'},workflow:{status:'Sudah Disposisi',notifications:[],booking:null},stage:2,rooms:[],simulated:true};
  vm.runInContext('visitModalData=data;visitModalTab=2;renderVisitWorkflow();',c);
  let content=fields.visitModalContent.innerHTML;
  assert.doesNotMatch(content.match(/<button[^>]*onclick="submitVisitAction\('notify'\)"[^>]*>([^]*?)<\/button>/)?.[1]||'',/fa-check/);
  assert.doesNotMatch(content.match(/<button[^>]*onclick="submitVisitAction\('book'\)"[^>]*>([^]*?)<\/button>/)?.[1]||'',/fa-check/);
  c.data.workflow.notifications=[{pic:'PIC',success:true}];
  vm.runInContext('renderVisitWorkflow()',c);content=fields.visitModalContent.innerHTML;
  assert.match(content, /Notifikasi dikirim/);
  c.data.workflow.booking={id:1,ruangan_id:1,nama_ruangan:'Room',tanggal:'2026-10-27',jam_mulai:'09:00',jam_selesai:'10:00'};c.data.stage=3;
  vm.runInContext('renderVisitWorkflow()',c);content=fields.visitModalContent.innerHTML;
  assert.match(content,/Jadwal kunjungan tersimpan/);
});
