'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){const c=vm.createContext({Utilities:{formatDate:()=> '2026-11-16 14:52:00'}});vm.runInContext(fs.readFileSync('Admin/Code.js','utf8'),c);return c;}
// Data_Presensi columns: ID, Rapat ID, Judul, Kategori, Nama, NIP, Jabatan, OPD, HP, Waktu, Member ID, Sumber, Dicatat
const rows=[
 [1,'R1','Rapat','Diskum','Adrial, S.K.M, M.K.M.','198001012005011001','Staf','Dinas Koperasi & UKM Batam','-','2026-11-16 14:50:00','','QR',''],
 [2,'R1','Rapat','OPD_Pemko','Budi','-','Kabid','Bappeda','-',new Date('2026-11-16T07:41:00Z'),'','QR',''],
 [3,'R2','Rapat Lain','Diskum','Salim','-','Staf','Dinas Koperasi & UKM Batam','-','2026-11-16 09:00:00','','QR',''],
];
function sheet(data){return {getLastRow:()=>data.length+1,getRange:(r,c,n,m)=>({getValues:()=>data.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+m))})};}

test('same Diskum employee (by NIP) on the same agenda is found',()=>{
 const c=load(),hit=c.findExistingPresensi_(sheet(rows),{rapat_id:'R1',kategori_peserta:'Diskum',nama:'Adrial, S.K.M, M.K.M.',nip:'198001012005011001'});
 assert.ok(hit);assert.equal(hit.jam,'14:50');
});
test('name match ignores case and spacing when NIP is missing',()=>{
 const c=load();assert.ok(c.findExistingPresensi_(sheet(rows),{rapat_id:'R1',kategori_peserta:'Diskum',nama:'  adrial,  s.k.m, m.k.m. ',nip:'-'}));
});
test('same person on a different agenda, or a different person, is allowed',()=>{
 const c=load(),s=sheet(rows);
 assert.equal(c.findExistingPresensi_(s,{rapat_id:'R2',kategori_peserta:'Diskum',nama:'Adrial, S.K.M, M.K.M.',nip:'198001012005011001'}),null);
 assert.equal(c.findExistingPresensi_(s,{rapat_id:'R1',kategori_peserta:'Diskum',nama:'Eva Corrina, S.E.',nip:''}),null);
});
test('non-Diskum attendees match on name plus institution',()=>{
 const c=load(),s=sheet(rows);
 assert.ok(c.findExistingPresensi_(s,{rapat_id:'R1',kategori_peserta:'OPD_Pemko',nama:'budi',nama_opd:'BAPPEDA'}));
 assert.equal(c.findExistingPresensi_(s,{rapat_id:'R1',kategori_peserta:'OPD_Pemko',nama:'Budi',nama_opd:'Dinas Kesehatan'}),null);
});
test('empty sheet has no existing attendance',()=>{
 const c=load();assert.equal(c.findExistingPresensi_({getLastRow:()=>1},{rapat_id:'R1',nama:'X'}),null);
});
test('the Presensi form shows the duplicate notice instead of a success message',()=>{
 const html=fs.readFileSync('Admin/Presensi.html','utf8');
 assert.match(html,/res\.duplicate\) \{\s*showDuplicateNotice\(res\.error\)/);
 assert.match(html,/id="duplicateNotice"[^>]*role="alertdialog"[^>]*hidden/);
 assert.match(html,/sudah melakukan presensi pada agenda ini/i);
 assert.match(html,/duplicateNoticeText'\)\.textContent=/,'message is set as text, never HTML');
});
