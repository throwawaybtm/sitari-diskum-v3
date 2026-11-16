'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function sheet(rows=[]) {
  const reads=[];
  return {rows,reads,getLastRow:()=>rows.length,getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),appendRow:r=>rows.push(Array.from(r)),
    getRange(row,col,count=1,width=1){return {getValues:()=>{reads.push({row,col,count,width});return Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??''));},
      setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>{rows[row-1+i]||=[];rows[row-1+i][col-1+j]=v;}));},
      setNumberFormat(){return this;},
      setValue(value){rows[row-1]||=[];rows[row-1][col-1]=value;}};}};
}

test('calendar reload derives manual attendance per agenda from saved rows, not QR rows',()=>{
  const context=vm.createContext({requireVisitAdmin_:()=>{}});for(const file of ['Code.js','MeetingRooms.js'])vm.runInContext(fs.readFileSync('Admin/'+file,'utf8'),context);
  const attendance=[[],[1,10,'','','','','','','','','ketua','Admin'],[2,11,'','','','','','','','','ketua','QR']];
  const meetings=[[],[10,'VISIT-TLD-1','Kunjungan 1',1,'Ruang','2026-11-02'],[11,'VISIT-TLD-2','Kunjungan 2',1,'Ruang','2026-11-02'],[12,'RPT-12','Rapat 12',1,'Ruang','2026-11-02']];
  const sheets={Data_Rapat:sheet(meetings),Data_Presensi:sheet(attendance)};
  context.getSpreadsheet=()=>({getSheetByName:name=>sheets[name]});context.formatDateVal=v=>v;context.formatTimeVal=v=>v;
  const result=context.getRapatCalendar().data;
  assert.deepEqual(Array.from(result,r=>r.manual_attendance),[true,false,false]);
});
function setup(){
  const context=vm.createContext({});
  for(const file of ['Code.js','VisitWorkflow.js','VisitWorkflowStorage.js','VisitArchive.js','AgendaDocuments.js','MeetingRooms.js','VisitPicContacts.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../Admin',file),'utf8'),context);
  const v={kode_kunjungan:'TLD-27102026-001',tipe_tamu:'luar_daerah',tujuan_bidang:'Bidang Pengawasan Koperasi',status_kunjungan:'Menunggu Konfirmasi',jumlah_orang:2,instansi:'Uji',lo_nama:'PIC'};
  const values=Array(20).fill('');values[1]=v.kode_kunjungan;values[19]=v.status_kunjungan;
  const sheets={Data_Tamu:sheet([[],values]),Data_Rapat:sheet([[],[99,'CANCELLED','Old',1,'Room','2026-10-27','09:00','10:00','','',0,'','Dibatalkan']])};
  context.Session={getActiveUser:()=>({getEmail:()=> 'admin@test.invalid'})};
  context.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'admin@test.invalid'})};
  context.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  context.SpreadsheetApp={flush(){}};context.Utilities={formatDate:()=> '2026-10-27'};
  context.getSpreadsheet=()=>({getSheetByName:name=>sheets[name],insertSheet:name=>sheets[name]=sheet()});
  context.getTamuList=()=>({data:[{...v,status_kunjungan:values[19]}]});
  context.getVisitByCode_=()=>({...v,status_kunjungan:values[19]});
  context.getSppdList=()=>({data:[]});context.getMasterData=()=>({data:{ruangan:[{id:1,nama_ruangan:'Room',kapasitas:50}]}});
  context.getRapatCalendar=()=>({data:[]});context.getApprovalActor_=()=> 'Admin';
  return {context,sheets,v};
}
test('GAS saves acknowledgement/version separately without advancing the visit status and rejects stale saves',()=>{
  const {context,sheets,v}=setup();
  const saved=context.saveVisitWorkflow({kode_kunjungan:v.kode_kunjungan,version:0,action:'confirm'});
  assert.equal(saved.success,true,saved.error);assert.equal(saved.data.workflow.status,'Menunggu Konfirmasi');
  assert.equal(saved.data.workflow.version,1);assert.equal(sheets.Alur_Kunjungan.rows.length,2);
  assert.equal(context.saveVisitWorkflow({kode_kunjungan:v.kode_kunjungan,version:0,action:'confirm'}).success,false);
  context.Session={getActiveUser:()=>({getEmail:()=> 'outsider@test.invalid'})};
  assert.equal(context.getVisitWorkflow({kode_kunjungan:v.kode_kunjungan}).success,false);
});
test('GAS visit bookings derive unique IDs from cancelled records as well as active agendas',()=>{
  const {context,sheets,v}=setup();
  const booking={ruangan_id:1,tanggal:'2026-10-27',jam_mulai:'11:00',jam_selesai:'12:00'};
  const saved=context.bookVisitAgenda_(v,booking,context.getMasterData().data.ruangan);
  assert.equal(saved.id,100);assert.equal(sheets.Data_Rapat.rows.at(-1)[0],100);
});

test('saving a visit updates its selected row without reading the complete visitor table',()=>{
  const {context,sheets,v}=setup();const extra=sheets.Data_Tamu.rows[1].slice();extra[1]='TLD-other';sheets.Data_Tamu.rows.push(extra);
  const saved=context.saveVisitWorkflow({kode_kunjungan:v.kode_kunjungan,version:0,action:'confirm'});assert.equal(saved.success,true,saved.error);
  assert.ok(!sheets.Data_Tamu.reads.some(r=>r.count>1&&r.width>1));assert.equal(sheets.Data_Tamu.rows[2][19],'Menunggu Konfirmasi');
});

test('GAS normal past-date booking persists actual event date and time',()=>{
  const {context:c,sheets,v}=setup();
  const state=c.newVisitWorkflow_(v);state.status='Sudah Disposisi';state.acknowledged={};state.disposisi={url:'scan'};state.notifications=[{pic:'PIC',success:true}];
  sheets.Alur_Kunjungan=sheet([[],[v.kode_kunjungan,0,JSON.stringify(state),'now']]);
  c.readMeetingRoomOptions_=()=>[{id:1,nama_ruangan:'Room',kapasitas:50}];
  c.getVisitByCode_=()=>({...v,status_kunjungan:sheets.Data_Tamu.rows[1][19],tanggal_kunjungan:sheets.Data_Tamu.rows[1][12],jam_kunjungan:sheets.Data_Tamu.rows[1][13]});
  c.notifyVisitPics_=()=>{throw new Error('Unexpected WA call');};
  const res=c.saveVisitWorkflow({kode_kunjungan:v.kode_kunjungan,version:0,action:'book',booking:{ruangan_id:1,tanggal:'2020-01-01',jam_mulai:'09:00',jam_selesai:'10:00'}});
  assert.equal(res.success,true,res.error);assert.equal(res.data.visit.tanggal_kunjungan,'2020-01-01');assert.equal(res.data.visit.jam_kunjungan,'09:00');assert.equal(sheets.Data_Rapat.rows.at(-1)[5],'2020-01-01');assert.equal(sheets.Data_Rapat.rows.at(-1)[6],'09:00');assert.equal(sheets.Data_Rapat.rows.at(-1)[12],'Terjadwal');
});

test('GAS public roster omits private visit data and manual attendance requires assigned admin with valid roster IDs',()=>{
  const {context,sheets,v}=setup();v.ketua_nama='Ketua Terdaftar';v.pengikut_list='Anggota A, S.E.\nAnggota B';
  const state=context.newVisitWorkflow_(v);state.status='Menunggu Kedatangan';state.booking={id:10};
  sheets.Alur_Kunjungan=sheet([[],[v.kode_kunjungan,0,JSON.stringify(state),'now']]);
  context.getRapatCalendar_=context.getRapatCalendar=()=>({data:[{id:10,kode_kunjungan:v.kode_kunjungan,tanggal:'2026-10-27'}]});
  const publicData=context.getVisitAttendanceRoster({rapat_id:10});
  assert.equal(publicData.success,true,publicData.error);
  assert.deepEqual(Object.keys(publicData.data).sort(),['instansi','locked','rapat_id','roster']);
  assert.equal(publicData.data.roster[0].nama,'Ketua Terdaftar');
  const saves=[];context.savePresensiRapat_=(payload,source)=>{saves.push({...payload,source});return {success:true};};
  assert.equal(context.submitManualVisitAttendance({rapat_id:10,member_ids:['ketua','unknown']}).success,false);assert.equal(saves.length,0);
  assert.equal(context.submitManualVisitAttendance({rapat_id:10,member_ids:['ketua']}).success,true);assert.equal(saves[0].nama,'Ketua Terdaftar');assert.equal(saves[0].source,'Admin');
  context.Session={getActiveUser:()=>({getEmail:()=> 'other@test.invalid'})};
  assert.equal(context.submitManualVisitAttendance({rapat_id:10,member_ids:['ketua']}).success,false);
});
