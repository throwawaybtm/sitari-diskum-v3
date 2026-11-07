'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {frontend}=require('./frontend.cjs');
const {createEnvironment}=require('../s02/synthetic.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));

test('blank and comma-only search never serializes nested fields, still copies and filters dates',()=>{
  const ui=frontend();let count=0;
  const rows=[{tanggal_kunjungan:'2026-11-07',nested:{toJSON(){count++;return 'secret';}}},{tanggal:'2026-11-08'}];
  for(const query of ['',undefined,' , , ']){
    const result=ui.context.filterAgendaRecords_(rows,query,'');assert.deepEqual(Array.from(result),rows);assert.notEqual(result,rows);
    assert.deepEqual(Array.from(ui.context.filterAgendaRecords_(rows,query,'2026-11-07')),[rows[0]]);
  }
  assert.equal(count,0);
  assert.equal(ui.context.filterAgendaRecords_(rows,'secret','').length,1);assert.equal(count,1);
});

test('meeting render indexes first matching visitor once and refreshes mutable status every render',()=>{
  const ui=frontend(),c=ui.context;let reads=0;
  const visits=Array.from({length:200},(_,i)=>({get kode_kunjungan(){reads++;return 'V'+i;},status_kunjungan:'Menunggu Kedatangan'}));
  const meetings=Array.from({length:100},(_,i)=>({id:i,kode_kunjungan:'V'+(i+100),tanggal:'2000-01-01',status:'Terjadwal'}));
  c.allTamuData=visits;c.renderMeetingsList(meetings);
  assert.ok(reads<=visits.length,'render-local identifier reads '+reads+' must not scale with cards times visitors');
  visits[100].status_kunjungan='Selesai';assert.equal(c.canAdminRecordAttendance(meetings[0]),false);
  c.renderMeetingsList([meetings[0]]);assert.match(ui.fields.meetingsListContainer.innerHTML,/onclick="openManualVisitAttendance\(this.dataset.id\)" disabled/);
  visits[100].status_kunjungan='Menunggu Kedatangan';c.renderMeetingsList([meetings[0]]);assert.doesNotMatch(ui.fields.meetingsListContainer.innerHTML,/onclick="openManualVisitAttendance\(this.dataset.id\)" disabled/);
});

test('exact desktop and phone list HTML, search, sorting and complete monthly rows match approved source',()=>{
  for(const phone of [false,true])for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
    const env=createEnvironment({size,profile}),visits=env.measure('getTamuList').result.data,meetings=env.measure('getRapatCalendar').result.data;
    const before=frontend({baseline:true,phone}),after=frontend({phone});
    for(const ui of [before,after]){ui.measure(visits,meetings);ui.context.document.getElementById('reportMonth').value='2026-11';ui.context.renderMonthlyReport();}
    for(const id of ['tamuTableBody','meetingsListContainer','monthlyReportRows'])assert.equal(after.fields[id].innerHTML,before.fields[id].innerHTML,id+' '+size);
    for(const query of ['','koperasi, mikro','synthetic person, impossible','<script>',' , '])for(const date of ['',visits[0].tanggal_kunjungan]){
      assert.deepEqual(plain(after.context.filterAgendaRecords_(visits,query,date)),plain(before.context.filterAgendaRecords_(visits,query,date)));
      for(const ui of [before,after]){ui.fields.visitSearch.value=query;ui.fields.visitSearchDate.value=date;ui.context.tamuTableState={key:'instansi',direction:'asc'};ui.context.renderTamuTable(visits);}
      assert.equal(after.fields.tamuTableBody.innerHTML,before.fields.tamuTableBody.innerHTML);
    }
    assert.deepEqual(plain(after.context.monthlyGuestRows(visits,'2026-11')),plain(before.context.monthlyGuestRows(visits,'2026-11')));
  }
});

test('visitor index preserves duplicate/coercible/missing identifiers and phone expansion',()=>{
  const visits=[{kode_kunjungan:7,status_kunjungan:'Selesai'},{kode_kunjungan:'7',status_kunjungan:'Menunggu Kedatangan'},{kode_kunjungan:'__proto__',status_kunjungan:'Kelola SPPD'},{kode_kunjungan:' 7 ',status_kunjungan:'Menunggu Kedatangan'},{kode_kunjungan:null,status_kunjungan:'Selesai'},{status_kunjungan:'Selesai'},{kode_kunjungan:NaN,status_kunjungan:'Selesai'},{kode_kunjungan:'07',status_kunjungan:'Menunggu Kedatangan'}];
  const meetings=['7','__proto__',' 7 ','missing','null','undefined','NaN','07'].map((code,id)=>({id,kode_kunjungan:code,tanggal:'2000-01-01',status:'Terjadwal'}));
  meetings.push({id:20,kode_rapat:'VISIT-7',tanggal:'2000-01-01',manual_attendance:true},{id:21,kode_kunjungan:'7',tanggal:'2999-01-01'},{id:22,kode_kunjungan:'7',tanggal:'2000-01-01',status:'Dibatalkan'});
  for(const phone of [false,true]){
    const before=frontend({baseline:true,phone}),after=frontend({phone});
    for(const ui of [before,after]){ui.measure(visits,meetings);ui.fields.meetingsListContainer.querySelectorAll=()=>[{dataset:{agendaId:'2'}}];ui.context.renderMeetingsList(meetings);}
    assert.equal(after.fields.meetingsListContainer.innerHTML,before.fields.meetingsListContainer.innerHTML);
    for(const meeting of meetings)assert.equal(after.context.canAdminRecordAttendance(meeting),before.context.canAdminRecordAttendance(meeting));
  }
});
