'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){const c=vm.createContext({Utilities:{formatDate:()=> '2026-11-02 08:23:45'}});vm.runInContext(fs.readFileSync('Admin/Code.js','utf8'),c);return c;}
test('admin-selected hour uses agenda date, with actual submission time retained separately',()=>{
 const c=load(),result=c.attendanceWriteTimes_({tanggal:'2026-10-30'},{jam_kehadiran:'14:25'},'AdminEntry');
 assert.equal(result.attendance,'2026-10-30 14:25:00');assert.equal(result.recorded,'2026-11-02 08:23:45');
 for(const value of ['', '2:00 PM','24:00','14:60'])assert.throws(()=>c.attendanceWriteTimes_({tanggal:'2026-10-30'},{jam_kehadiran:value},'AdminEntry'),/jam|24/i);
});
test('QR submissions retain automatic time and cannot request an admin time override',()=>{
 const c=load();assert.equal(c.attendanceWriteTimes_({tanggal:'2026-10-30'},{},'QR').attendance,'2026-11-02 08:23:45');
 assert.throws(()=>c.attendanceWriteTimes_({tanggal:'2026-10-30'},{jam_kehadiran:'14:25'},'QR'),/admin/i);
});
test('admin attendance endpoint checks authorization before any lock or write',()=>{
 const c=load();c.requireVisitAdmin_=()=>{throw new Error('Akses ditolak');};c.LockService={getScriptLock:()=>assert.fail('must authorize first')};
 assert.equal(c.submitAdminPresensiRapat({nama:'Staf',rapat_id:1,jam_kehadiran:'14:25'}).success,false);
});
