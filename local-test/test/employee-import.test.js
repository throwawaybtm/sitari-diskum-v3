'use strict';
const { people: syntheticPeople } = require('./synthetic-fixtures');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function load(){const c=vm.createContext({});for(const name of ['EmployeeDirectory.js','EmployeeImport.js','VisitPicContacts.js'])vm.runInContext(fs.readFileSync('Admin/'+name,'utf8'),c);return c;}
test('employee directory contains all 70 people in the merged 8 units with 11 missing NIP',()=>{
  const c=load(),rows=c.buildEmployeeMasterRows_([],vm.runInContext('DISKUM_EMPLOYEE_DIRECTORY',c));assert.equal(rows.length,70);assert.equal(new Set(rows.map(r=>r[0])).size,70);assert.equal(new Set(rows.map(r=>r[4])).size,8);assert.equal(rows.filter(r=>!r[1]).length,11);assert.equal(rows.filter(r=>r[4]==='UPTD Pemberdayaan dan Pelindungan Koperasi').length,0);assert.equal(rows.filter(r=>r[4]==='Bidang Pemberdayaan dan Pelindungan Koperasi').length,9);
});
test('import retains matched employee IDs, workload and LO flags while preserving NIP text',()=>{
  const c=load(),people=vm.runInContext('DISKUM_EMPLOYEE_DIRECTORY',c),p=people.find(p=>p.nama===syntheticPeople.importMatch.nama);
  const rows=c.buildEmployeeMasterRows_([[17,p.nip.replace(/\s/g,''),'Old spelling','Old job','Old department',1,8,'Aktif'],[22,'',syntheticPeople.missingNip.nama,'Old job','Old unit',0,0,'Aktif']],people);
  const updated=rows.find(r=>r[2]===p.nama);assert.equal(updated[0],17);assert.equal(updated[1],p.nip);assert.equal(updated[5],1);assert.equal(updated[6],8);assert.equal(updated[8],p.pangkat);assert.equal(rows.find(r=>r[2]===syntheticPeople.missingNip.nama)[0],22);assert.equal(rows.find(r=>r[2]===syntheticPeople.missingNip.nama)[1],'');assert.equal(new Set(rows.map(r=>r[0])).size,70);
});

function migration(fail=false){
  const c=load(),props=new Map(),rows=[['ID','NIP','Nama Pegawai','Jabatan','Bidang','Is_LO','Workload_Count','Status_Aktif'],[7,'',syntheticPeople.missingNip.nama,'Konsultan','Old unit',0,0,'Aktif']],original=JSON.stringify(rows);let copies=0;
  const sheet={getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getLastRow:()=>rows.length,clearContents(){rows.length=0},getRange(row,col,height=1,width=1){const range={clearContent(){for(let i=0;i<height;i++){rows[row-1+i]||=[];for(let j=0;j<width;j++)rows[row-1+i][col-1+j]='';}return range},setNumberFormat:()=>range,setValues(values){if(fail&&values.length===70){fail=false;throw Error('simulated write error');}values.forEach((r,i)=>r.forEach((v,j)=>{rows[row-1+i]||=[];rows[row-1+i][col-1+j]=v;}));return range},getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??''))};return range}};
  c.getSpreadsheet=()=>({getSheetByName:()=>sheet,copy(){copies++;const saved=rows.map(r=>r.slice());return {getId:()=> 'private-backup',getUrl:()=> '/private-backup',getSheetByName:()=>({getDataRange:()=>({getValues:()=>saved})})}}});
  c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})};c.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};c.SpreadsheetApp={flush(){}};c.Utilities={formatDate:()=> '2026-10-30'};c.DriveApp={Access:{PRIVATE:0},getFileById:()=>({getSharingAccess:()=>0})};return {c,props,rows,original,copies:()=>copies};
}
test('GAS employee migration backs up first, imports 70 people once and reports 8 units',()=>{
  const t=migration(),result=t.c.ensureEmployeeDirectory_();assert.equal(result.count,70);assert.equal(result.departments,8);assert.equal(t.rows.length,71);assert.equal(t.rows.find(r=>r[2]===syntheticPeople.missingNip.nama)[0],7);t.c.ensureEmployeeDirectory_();assert.equal(t.copies(),1);
});
test('GAS employee migration restores the exact original values after a write failure',()=>{
  const t=migration(true);assert.throws(()=>t.c.ensureEmployeeDirectory_(),/simulated write error/);assert.equal(JSON.stringify(t.rows),t.original);assert.equal(t.props.size,0);
});
test('GAS readMasterData_ and getPublicAttendanceMasterData merge legacy UPTD Pemberdayaan rows into Bidang Pemberdayaan (9 total)',()=>{
  const dir=JSON.parse(fs.readFileSync('local-test/previews/employee-directory.json','utf8'));
  const legacyRows=dir.map((e,idx)=>[e.id||(idx+1),e.nip,e.nama,e.jabatan,(e.id==='80'||e.id==='81'||e.id===80||e.id===81)?'UPTD Pemberdayaan dan Pelindungan Koperasi':e.bidang,0,0,'Aktif',e.pangkat]);
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync('Admin/MeetingRooms.js','utf8'),c);
  vm.runInContext(fs.readFileSync('Admin/Code.js','utf8'),c);
  vm.runInContext(fs.readFileSync('Admin/PublicApi.js','utf8'),c);
  c.requireVisitAdmin_=()=>{};
  c.getSpreadsheet=()=>({getId:()=> 'ss-id',getSheetByName:name=>name==='Master_Pegawai'?{getLastRow:()=>legacyRows.length+1,getLastColumn:()=>9,getRange:()=>({getValues:()=>legacyRows})}:null});
  const adminMaster=c.getMasterData();
  const publicMaster=c.getPublicAttendanceMasterData();
  for(const res of [adminMaster,publicMaster]){
    assert.equal(res.success,true);
    assert.equal(res.data.pegawai.length,70);
    assert.equal(res.data.pegawai.filter(p=>p.bidang==='UPTD Pemberdayaan dan Pelindungan Koperasi').length,0);
    assert.equal(res.data.pegawai.filter(p=>p.bidang==='Bidang Pemberdayaan dan Pelindungan Koperasi').length,9);
  }
});
