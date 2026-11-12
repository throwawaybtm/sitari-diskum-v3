'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){const c=vm.createContext({Date,Utilities:{formatDate:(date,zone)=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)}});const file='Admin/AgendaAttendanceData.js';if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);return c;}
test('attendance viewer formats event time, including manual backfill and ISO QR timestamps',()=>{
 const c=load();assert.equal(typeof c.makeAgendaAttendanceList_,'function');
 const rows=c.makeAgendaAttendanceList_([{nama:'QR',waktu:'2026-11-02T07:25:00Z'},{nama:'Admin',waktu:'2026-10-30 14:25:00'},{nama:'Legacy',waktu:new Date('2026-11-02T08:15:00Z')},{nama:'Unknown',waktu:''}],'Asia/Jakarta');
 assert.equal(rows[0].nama,'Admin');assert.equal(rows[0].tanggal,'30-10-2026');assert.equal(rows[0].jam,'14:25');
 assert.equal(rows[1].tanggal,'02-11-2026');assert.equal(rows[1].jam,'14:25');assert.equal(rows[2].jam,'15:15');assert.equal(rows[3].jam,'-');assert.equal(rows[3].no,4);
});
test('view endpoint authorizes before reading and filters all agenda types by agenda ID',()=>{
 const c=load();assert.equal(typeof c.getAgendaAttendance,'function');let denied=true,reads=0;
 c.requireVisitAdmin_=()=>{if(denied)throw Error('Akses ditolak');};
 const meetingRows=[[1,'RPT-1','Internal',1,'Ruang Rapat Utama Diskum','2026-11-02'],[2,'VISIT-TLD-2','TLD',1,'Ruang Rapat Utama Diskum','2026-11-03']];
 const attendanceRows=[[1,1,'','','Alice','','','','','2026-11-02 14:25:00','','AdminEntry','2026-11-02 08:00:00'],[2,2,'','','Bob','','','','','2026-11-03 10:00:00']];
 const sheet=rows=>({getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows})});
 c.getSpreadsheet=()=>{reads++;return {getSpreadsheetTimeZone:()=> 'Asia/Jakarta',getSheetByName:name=>name==='Data_Rapat'?sheet(meetingRows):sheet(attendanceRows)};};
 assert.equal(c.getAgendaAttendance({rapat_id:1}).success,false);assert.equal(reads,0);denied=false;
 const internal=c.getAgendaAttendance({rapat_id:1});assert.equal(internal.success,true,internal.error);assert.equal(internal.data.attendance.length,1);assert.equal(internal.data.attendance[0].nama,'Alice');assert.equal(internal.data.attendance[0].tanggal,'02-11-2026');
 assert.equal(c.getAgendaAttendance({rapat_id:2}).data.attendance[0].nama,'Bob');assert.equal(c.getAgendaAttendance({rapat_id:99}).success,false);
});
test('attendance dialog opens immediately and ignores older responses after switching agenda',async()=>{
 const fields={agendaAttendanceModal:{open:false,showModal(){this.open=true;},close(){this.open=false;}},agendaAttendanceName:{},agendaAttendanceRows:{},agendaAttendanceCount:{},agendaAttendanceError:{hidden:true},agendaAttendanceRefresh:{}};
 const pending=[];const c=vm.createContext({allRapatData:[{id:1,judul_rapat:'A'},{id:2,judul_rapat:'B'}],document:{getElementById:id=>fields[id]},escapeHtml:value=>String(value),visitRpc:()=>new Promise(resolve=>pending.push(resolve))});
 vm.runInContext(fs.readFileSync('Admin/AgendaAttendance.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
 c.openAgendaAttendance(1);assert.equal(fields.agendaAttendanceModal.open,true);assert.match(fields.agendaAttendanceRows.innerHTML,/Memuat/);
 c.openAgendaAttendance(2);pending[0]({agenda:{judul_rapat:'A'},attendance:[{nama:'Old'}]});await new Promise(resolve=>setImmediate(resolve));assert.match(fields.agendaAttendanceRows.innerHTML,/Memuat/);
 pending[1]({agenda:{judul_rapat:'B'},attendance:[{no:1,nama:'New',tanggal:'30-10-2026',jam:'14:25'}]});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fields.agendaAttendanceName.textContent,'B');assert.match(fields.agendaAttendanceRows.innerHTML,/New/);assert.doesNotMatch(fields.agendaAttendanceRows.innerHTML,/Old/);assert.equal(fields.agendaAttendanceRefresh.disabled,false);
 c.closeAgendaAttendance();assert.equal(fields.agendaAttendanceModal.open,false);
});
test('Presensi modal displays Presensi Manual below attendance table for visit agendas and transitions cleanly',async()=>{
 const fields={agendaAttendanceModal:{open:false,showModal(){this.open=true;},close(){this.open=false;}},agendaAttendanceName:{},agendaAttendanceRows:{},agendaAttendanceCount:{},agendaAttendanceError:{hidden:true},agendaAttendanceRefresh:{},agendaAttendanceManualWrap:{hidden:true},agendaAttendanceManualBtn:{disabled:false,className:''},agendaAttendanceManualNote:{textContent:''}};
 const openedManual=[];
 const internal={id:1,kode_rapat:'RPT-1',judul_rapat:'Rapat Internal'};
 const visit={id:2,kode_rapat:'VISIT-TLD-2',kode_kunjungan:'TLD-2',judul_rapat:'Kunjungan Tamu',status:'Terjadwal'};
 const lockedVisit={...visit,id:3,status:'Terkunci',locked:true};
 const c=vm.createContext({allRapatData:[internal,visit,lockedVisit],isMeetingLocked:m=>Boolean(m&&(m.locked||m.status==='Terkunci')),canAdminRecordAttendance:m=>m.id===2,openManualVisitAttendance:id=>openedManual.push(id),document:{getElementById:id=>fields[id]},escapeHtml:value=>String(value),visitRpc:async()=>({agenda:{judul_rapat:'Kunjungan Tamu'},attendance:[]})});
 vm.runInContext(fs.readFileSync('Admin/AgendaAttendance.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
 c.openAgendaAttendance(1);
 assert.equal(fields.agendaAttendanceManualWrap.hidden,true,'internal meeting hides visit manual attendance footer');
 c.openAgendaAttendance(2);
 assert.equal(fields.agendaAttendanceManualWrap.hidden,false);
 assert.equal(fields.agendaAttendanceManualBtn.disabled,false);
 c.openManualAttendanceFromAgenda();
 assert.equal(fields.agendaAttendanceModal.open,false,'closes dialog before opening manual attendance overlay');
 assert.deepEqual(openedManual,['2']);
 c.openAgendaAttendance(3);
 assert.equal(fields.agendaAttendanceManualWrap.hidden,false);
 assert.equal(fields.agendaAttendanceManualBtn.disabled,true,'locked visit disables Presensi Manual button');
});
