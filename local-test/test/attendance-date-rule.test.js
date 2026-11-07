'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function backend(now){
  const writes=[],c=vm.createContext({Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}},Utilities:{formatDate:()=>now},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
  for(const f of ['Code.js','MeetingRooms.js','VisitWorkflow.js','VisitWorkflowStorage.js'])vm.runInContext(fs.readFileSync('Admin/'+f,'utf8'),c);
  c.getSpreadsheet=()=>({getSheetByName:name=>name==='Data_Presensi'?{getLastRow:()=>writes.length+1,getLastColumn:()=>12,getRange:()=>({setValue(){},setNumberFormat(){}}),appendRow:r=>writes.push(Array.from(r))}:null});
  c.autoSortPresensi=()=>{};const meeting={id:1,tanggal:'2026-11-02',jam_mulai:'09:00',jam_selesai:'10:00',status:'Terjadwal'};
  c.getRapatCalendar=()=>({data:[meeting]});return {c,writes,meeting};
}
test('public submissions reject the previous day and open at exactly midnight WIB',()=>{
  for(const [now,expected]of [['2026-11-01T16:59:59Z',false],['2026-11-01T17:00:00Z',true],['2026-11-02T12:00:00Z',true],['2026-11-04T12:00:00Z',true]]){
    const {c,writes}=backend(now),res=c.submitPresensiRapat({rapat_id:1,nama:'Participant'});assert.equal(res.success,expected,now);assert.equal(writes.length,expected?1:0);
  }
});
test('completed agendas reject public attendance even when an old QR URL remains open',()=>{
  const {c,meeting,writes}=backend('2026-11-04T12:00:00Z');meeting.status='Selesai';assert.equal(c.submitPresensiRapat({rapat_id:1,nama:'Participant'}).success,false);assert.equal(writes.length,0);
});

test('admin individual attendance writes the requested agenda-day hour without setting the bulk manual QR lock',()=>{
  const {c,meeting,writes}=backend('2026-11-04T12:00:00Z');c.requireVisitAdmin_=()=>{};
  const result=c.submitAdminPresensiRapat({rapat_id:1,nama:'Participant',jam_kehadiran:'14:25'});
  assert.equal(result.success,true,result.error);assert.equal(writes[0][9],'2026-11-02 14:25:00');
  assert.equal(writes[0][11],'AdminEntry');assert.equal(writes[0][12],'2026-11-04T12:00:00Z');
  assert.notEqual(meeting.manual_attendance,true);assert.equal(c.attendanceAvailability_(meeting).open,true);
});

test('a public QR RPC cannot forge a manual attendance hour',()=>{
  const {c,writes}=backend('2026-11-04T12:00:00Z');
  const result=c.submitPresensiRapat({rapat_id:1,nama:'Participant',jam_kehadiran:'14:25'});
  assert.equal(result.success,false);assert.match(result.error,/admin/i);assert.equal(writes.length,0);
});

test('manual attendance closes public QR submissions but keeps late admin entry open',()=>{
  const {c,meeting,writes}=backend('2026-11-04T12:00:00Z');meeting.manual_attendance=true;
  assert.equal(c.submitPresensiRapat({rapat_id:1,nama:'Participant'}).success,false);
  assert.equal(writes.length,0);
  assert.equal(c.adminAttendanceAvailability_(meeting).open,true);
  const browser=vm.createContext({});vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html','utf8').match(/<script>([^]*?)<\/script>/)[1],browser);
  assert.equal(browser.attendanceAvailability(meeting,new Date('2026-11-04T12:00:00Z')).open,false);
  assert.equal(browser.adminAttendanceAvailability(meeting,new Date('2026-11-04T12:00:00Z')).open,true);
});

test('manual TLD entry uses the same opening date, allows late entry and rejects validation locks',()=>{
  for(const [now,expected]of [['2026-11-01T16:59:59Z',false],['2026-11-04T12:00:00Z',true]]){
    const {c,meeting,writes}=backend(now);meeting.kode_kunjungan='TLD-1';c.requireVisitAdmin_=()=>{};
    const data={visit:{kode_kunjungan:'TLD-1',ketua_nama:'Ketua',instansi:'Asal'},workflow:{booking:{id:1},status:'Menunggu Kedatangan'},attendance:[]};
    c.visitAttendanceForAgenda_=()=>data;c.readVisitWorkflow_=()=>data;
    const res=c.submitManualVisitAttendance({rapat_id:1,member_ids:['ketua']});assert.equal(res.success,expected,res.error);assert.equal(writes.length,expected?1:0);
    data.workflow.arrival={at:now};assert.equal(c.submitManualVisitAttendance({rapat_id:1,member_ids:['ketua']}).success,false);
  }
});
test('browser and server date rules agree for early, late, completed and malformed agendas',()=>{
  const {c}=backend('2026-11-01T17:00:00Z'),browser=vm.createContext({});
  const file='Admin/AttendancePolicy.html';assert.ok(fs.existsSync(file),'shared browser policy exists');vm.runInContext(fs.readFileSync(file,'utf8').match(/<script>([^]*?)<\/script>/)[1],browser);
  for(const meeting of [{tanggal:'2026-11-02'},{tanggal:'2026-11-03'},{tanggal:'2020-01-01'},{tanggal:'2020-01-01',status:'Selesai'},{tanggal:'bad'}]){
    assert.deepEqual(JSON.parse(JSON.stringify(c.attendanceAvailability_(meeting,new Date('2026-11-01T17:00:00Z')))),JSON.parse(JSON.stringify(browser.attendanceAvailability(meeting,new Date('2026-11-01T17:00:00Z')))));
  }
});
