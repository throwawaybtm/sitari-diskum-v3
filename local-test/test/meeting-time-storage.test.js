'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(rows=[],display=rows){
 const formats=[],writes=[],ss={getSheetByName:name=>name==='Data_Rapat'?sheet:null,getSpreadsheetTimeZone:()=> 'America/Los_Angeles'};
 const sheet={getParent:()=>ss,getLastRow:()=>rows.length+1,getLastColumn:()=>14,appendRow:row=>writes.push(row),getRange:()=>({getValues:()=>rows,getDisplayValues:()=>display,setNumberFormat:value=>formats.push(value)})};
 const c=vm.createContext({Date,Utilities:{formatDate:(d,tz,fmt)=>fmt==='HH:mm'?(tz==='America/Los_Angeles'?(d.getUTCHours()===22?'14:00':'16:00'):'05:00'):'2026-11-01'},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 for(const file of ['MeetingRooms.js','Code.js','AgendaDocuments.js'])vm.runInContext(fs.readFileSync('Admin/'+file,'utf8'),c);
 c.getSpreadsheet=()=>ss;c.autoSortAllSheets=()=>{};return {c,formats,writes};
}
const p={judul:'Rapat',ruangan:'1|Ruang',tanggal:'2026-11-01',jam_mulai:'14:00',jam_selesai:'16:00',bidang:'Unit',pimpinan:'Pimpinan',agenda:'Agenda'};
const row=[1,'RPT-1','Rapat',1,'Ruang','2026-11-01',new Date('1899-12-30T22:00:00Z'),new Date('1899-12-31T00:00:00Z'),'Unit','Pimpinan',2,'Agenda','Terjadwal',''];
const display=[...row];display[6]='2:00:00 PM';display[7]='4:00:00 PM';
test('calendar and clash checks use displayed sheet times rather than timezone-shifted time-only Date values',()=>{
 const {c,writes}=context([row],[display]);const agenda=c.getRapatCalendar().data[0];
 assert.equal(agenda.jam_mulai,'14:00');assert.equal(agenda.jam_selesai,'16:00');
 for(const times of [['14:00','16:00'],['13:00','15:00'],['15:00','17:00'],['14:30','15:00']])assert.equal(c.simpanJadwalRapat({...p,jam_mulai:times[0],jam_selesai:times[1]}).success,false);
 assert.equal(writes.length,0);
 assert.equal(c.simpanJadwalRapat({...p,jam_mulai:'16:00',jam_selesai:'17:00'}).success,true);
 assert.equal(c.simpanJadwalRapat({...p,ruangan:'2|Lain'}).success,true);
});
test('cancelled agendas do not block a room; future bookings persist canonical date/time text',()=>{
 const cancelled=[...row];cancelled[12]='Dibatalkan';const {c,formats,writes}=context([cancelled],[display]);
 assert.equal(c.simpanJadwalRapat(p).success,true);assert.ok(formats.includes('@'));assert.deepEqual(Array.from(writes[0].slice(5,8)),['2026-11-01','14:00','16:00']);
});
test('time normalization handles 24-hour, AM/PM and numeric spreadsheet time values',()=>{
 const {c}=context();for(const [value,expected] of [['14:00','14:00'],['2:00 PM','14:00'],['12:00 AM','00:00'],['12:00 PM','12:00'],['9.05.00','09:05'],[14/24,'14:00']])assert.equal(c.normalizeMeetingTime_(value),expected);
 assert.equal(c.normalizeMeetingTime_('25:00'),'');
});


test('ambiguous hh:mm display formatting cannot move numeric or Date afternoon bookings into the morning',()=>{
 for(const numeric of [true,false]){
  const raw=[...row];if(numeric){raw[6]=14/24;raw[7]=16/24;}
  const shown=[...display];shown[6]='02:00';shown[7]='04:00';
  const {c}=context([raw],[shown]);const agenda=c.getRapatCalendar().data[0];
  assert.equal(agenda.jam_mulai,'14:00');assert.equal(agenda.jam_selesai,'16:00');
  assert.equal(c.simpanJadwalRapat({...p,jam_mulai:'14:30',jam_selesai:'15:30'}).success,false);
 }
});
