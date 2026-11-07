'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync('Admin/'+file,'utf8');
function modalContext(file){
  const fields={visitWorkflowModal:{hidden:true},visitModalError:{hidden:true},manualVisitAttendance:{hidden:true}},pending=[];const context=vm.createContext({document:{activeElement:{},addEventListener(){},body:{style:{overflow:''}},getElementById:id=>fields[id]||=( {hidden:true,style:{},focus(){}}),querySelector:()=>({focus(){}})},showToast(){},callBackend:(name,args,success,error)=>pending.push({name,args,success,error}),allRapatData:[{id:1,kode_kunjungan:'TLD-1'}],isMeetingOverdue:()=>false});
  if(file==='VisitAttendance.html'){context.canAdminRecordAttendance=()=>true;context.visitRpc=(name,payload)=>new Promise((resolve,reject)=>pending.push({name,payload,success:resolve,error:reject}));}
  vm.runInContext(read(file).match(/<script>([^]*?)<\/script>/)[1],context);
  context.renderVisitWorkflow=()=>{};context.renderManualVisitAttendance=()=>{};
  return {context,fields,pending};
}
const data=code=>({visit:{kode_kunjungan:code,tipe_tamu:'luar_daerah'},workflow:{status:'Menunggu Konfirmasi'},stage:0});

test('manual save updates the calendar immediately only after a successful response',async()=>{
  for(const success of [true,false]){
    const {context:c,pending:p}=modalContext('VisitAttendance.html');let renders=0;
    c.document.querySelectorAll=selector=>selector.includes('data-member-job')?[]:[{value:'ketua'}];
    c.renderMeetingsList=()=>renders++;
    vm.runInContext("manualAttendanceData={workflow:{booking:{id:1}}}",c);
    const save=c.saveManualVisitAttendance();
    assert.equal(c.allRapatData[0].manual_attendance,undefined);
    if(success)p[0].success({workflow:{booking:{id:1}},attendance:[{source:'Admin'}]});else p[0].error(new Error('Save failed'));
    await save;
    assert.equal(c.allRapatData[0].manual_attendance,success?true:undefined);
    assert.equal(renders,success?1:0);
  }
});
test('EDIT appears before RPC completes; closing cancels response and restores scroll',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');const task=c.openVisitWorkflow('TLD-1');
  assert.equal(f.visitWorkflowModal.hidden,false);assert.match(f.visitModalContent.innerHTML,/Memuat/);
  c.closeVisitWorkflow();assert.equal(f.visitWorkflowModal.hidden,true);assert.equal(c.document.body.style.overflow,'');
  p[0].success({success:true,data:data('TLD-1')});await task;assert.equal(f.visitWorkflowModal.hidden,true);
});
test('a slower old EDIT response cannot overwrite a newer visit',async()=>{
  const {context:c,pending:p}=modalContext('VisitModal.html');const first=c.openVisitWorkflow('OLD'),second=c.openVisitWorkflow('NEW');
  assert.equal(p.length,2);p[1].success({success:true,data:data('NEW')});await second;p[0].success({success:true,data:data('OLD')});await first;
  assert.equal(vm.runInContext('visitModalData.visit.kode_kunjungan',c),'NEW');
});
test('EDIT failure is visible and closable',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');const task=c.openVisitWorkflow('TLD-1');p[0].error(new Error('Offline'));await task;
  assert.equal(f.visitModalError.hidden,false);assert.equal(f.visitModalError.textContent,'Offline');c.closeVisitWorkflow();assert.equal(f.visitWorkflowModal.hidden,true);
});

test('EDIT shows cached visitor details before the response without enabling approval actions',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');
  c.escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  c.allTamuData=[{kode_kunjungan:'TLD-1',tipe_tamu:'luar_daerah',instansi:'Instansi <Asal>',ketua_nama:'Ketua Terdaftar',jumlah_orang:3,keperluan:'Agenda Uji',tanggal_kunjungan:'2026-10-31',jam_kunjungan:'09:00'}];
  const task=c.openVisitWorkflow('TLD-1');
  assert.match(f.visitModalContent.innerHTML,/Instansi &lt;Asal&gt;/);assert.match(f.visitModalContent.innerHTML,/Ketua Terdaftar/);assert.match(f.visitModalContent.innerHTML,/Agenda Uji/);assert.match(f.visitModalContent.innerHTML,/31-10-2026 09:00/);
  assert.match(f.visitModalContent.innerHTML,/Memeriksa data terbaru/);assert.doesNotMatch(f.visitModalContent.innerHTML,/submitVisitAction|<input|<iframe/);assert.equal(vm.runInContext('visitModalData',c),null);
  p[0].success({success:true,data:data('TLD-1')});await task;assert.equal(vm.runInContext('visitModalData.visit.kode_kunjungan',c),'TLD-1');
});

test('a failed refresh retains cached read-only details alongside the error',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');c.escapeHtml=v=>String(v??'');c.allTamuData=[{kode_kunjungan:'TLD-1',instansi:'Instansi Terdaftar'}];
  const task=c.openVisitWorkflow('TLD-1');p[0].error(new Error('Offline'));await task;
  assert.match(f.visitModalContent.innerHTML,/Instansi Terdaftar/);assert.equal(f.visitModalError.textContent,'Offline');assert.equal(vm.runInContext('visitModalData',c),null);
});

test('EDIT requests the current tab and fetches an unloaded tab while keeping same-version tab data',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');const task=c.openVisitWorkflow('TLD-1');
  assert.equal(p[0].args[0].tab,'current');p[0].success({success:true,data:{...data('TLD-1'),stage:3,tab:0,limited:true,loadedTabs:[0],rooms:[],attendance:[],roster:[]}});await task;
  assert.equal(vm.runInContext('visitModalTab',c),0);const next=c.selectVisitTab(3);assert.equal(p[1].args[0].tab,3);assert.match(f.visitModalContent.innerHTML,/Memuat/);
  p[1].success({success:true,data:{...data('TLD-1'),stage:3,tab:3,limited:true,loadedTabs:[3],rooms:[],attendance:[{nama:'Ketua'}],roster:[]}});await next;
  assert.equal(vm.runInContext('visitModalData.attendance.length',c),1);assert.deepEqual(Array.from(vm.runInContext('visitModalData.loadedTabs',c)),[0,3]);
  await c.selectVisitTab(0);assert.equal(p.length,2);assert.equal(vm.runInContext('visitModalData.attendance.length',c),1);
});
test('closing a pending tab load ignores its late response',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitModal.html');const open=c.openVisitWorkflow('TLD-1');p[0].success({success:true,data:{...data('TLD-1'),stage:3,tab:0,limited:true,loadedTabs:[0]}});await open;
  const next=c.selectVisitTab(3);c.closeVisitWorkflow();p[1].success({success:true,data:{...data('TLD-1'),tab:3,limited:true,loadedTabs:[3]}});await next;
  assert.equal(f.visitWorkflowModal.hidden,true);assert.equal(vm.runInContext('visitModalData',c),null);
});

test('a changed workflow version discards previously loaded tab data',async()=>{
  const {context:c,pending:p}=modalContext('VisitModal.html');const open=c.openVisitWorkflow('TLD-1');
  p[0].success({success:true,data:{...data('TLD-1'),workflow:{version:1,status:'Menunggu Kedatangan'},stage:3,tab:0,limited:true,loadedTabs:[0],attendance:[]}});await open;
  const next=c.selectVisitTab(3);p[1].success({success:true,data:{...data('TLD-1'),workflow:{version:2,status:'Menunggu Kedatangan'},stage:3,tab:3,limited:true,loadedTabs:[3],attendance:[{nama:'Ketua'}]}});await next;
  assert.deepEqual(Array.from(vm.runInContext('visitModalData.loadedTabs',c)),[3]);
});

test('entering Kedatangan refreshes attendance even when its tab was already loaded',async()=>{
  const {context:c,pending:p}=modalContext('VisitModal.html');const open=c.openVisitWorkflow('TLD-1');
  const initial={...data('TLD-1'),workflow:{version:2,status:'Menunggu Kedatangan'},stage:3,tab:0,limited:true,loadedTabs:[0,3],attendance:[],roster:[],rooms:[]};
  p[0].success({success:true,data:initial});await open;const tab=c.selectVisitTab(3);assert.equal(p.length,2);
  p[1].success({success:true,data:{...initial,tab:3,loadedTabs:[3],attendance:[{nama:'Ketua',waktu:'2026-11-03 09:00'}]}});await tab;
  assert.equal(vm.runInContext('visitModalData.attendance.length',c),1);
});
test('manual attendance immediately displays loading and ignores response after closing',async()=>{
  const {context:c,fields:f,pending:p}=modalContext('VisitAttendance.html');const task=c.openManualVisitAttendance(1);
  assert.equal(f.manualVisitAttendance.hidden,false);assert.match(f.manualAttendanceList.innerHTML,/Memuat/);c.closeManualVisitAttendance();p[0].success(data('TLD-1'));await task;assert.equal(f.manualVisitAttendance.hidden,true);
});
test('room data is requested once for simultaneous/repeated openings and retried after failure',async()=>{
  const pending=[],c=vm.createContext({callBackend:(name,args,ok,fail)=>pending.push({name,ok,fail})});
  const source=read('Index.html');const match=source.match(/    function loadMeetingRoomOptions\([^]*?\n    \}/);assert.ok(match,'room loader exists');
  vm.runInContext('let meetingRoomOptions=null,meetingRoomRequest=null;'+match[0],c);
  const a=c.loadMeetingRoomOptions(),b=c.loadMeetingRoomOptions();assert.equal(pending.length,1);pending[0].fail(new Error('Offline'));await assert.rejects(a);await assert.rejects(b);
  const retry=c.loadMeetingRoomOptions();pending[1].ok({success:true,data:{ruangan:[{id:1}]}});assert.equal((await retry).length,1);await c.loadMeetingRoomOptions();assert.equal(pending.length,2);
});
test('workflow result updates local visit without reloading all lists or regressing unfinished startup',()=>{
  const source=read('Index.html'),match=source.match(/    function applyVisitUpdate\([^]*?\n    \}/);assert.ok(match,'targeted updater exists');
  const calls=[],c=vm.createContext({renderTamuTable:()=>{},renderMonthlyReport:()=>{},renderRecentTamu:()=>{},refreshVisitSummary:()=>calls.push('summary'),refreshVisitCalendar:()=>calls.push('calendar')});
  vm.runInContext('let allTamuData=[{kode_kunjungan:"A",status_kunjungan:"Menunggu Konfirmasi"}]; let visitListRevision=0,visitListPatches=new Map();'+match[0],c);
  c.applyVisitUpdate({visit:{kode_kunjungan:'A',status_kunjungan:'Menunggu Konfirmasi'},workflow:{status:'Menunggu Konfirmasi'}},'notifyContact');assert.deepEqual(calls,[]);
  c.applyVisitUpdate({visit:{kode_kunjungan:'A'},workflow:{status:'Sudah Disposisi'}},'disposisi');assert.equal(vm.runInContext('allTamuData[0].status_kunjungan',c),'Sudah Disposisi');assert.equal(vm.runInContext('visitListRevision',c),2);
  c.applyVisitUpdate({visit:{kode_kunjungan:'A'},workflow:{status:'Menunggu Kedatangan'}},'book');assert.deepEqual(calls,['summary','calendar']);
});

test('a booked workflow read uses one spreadsheet handle and omits employee/OPD reads',()=>{
  let opens=0;const reads=[];
  const visit=Array(21).fill('');Object.assign(visit,{0:1,1:'TLD-1',2:'luar_daerah',5:1,6:'Ketua',12:'2026-10-31',13:'09:00',19:'Menunggu Kedatangan'});
  const state={status:'Menunggu Kedatangan',booking:{id:1},files:{},history:[]};
  const rows={Data_Tamu:[visit],Alur_Kunjungan:[['TLD-1',1,JSON.stringify(state),'']],Data_Presensi:[[1,1,'','','Ketua','','Jabatan','','','2026-10-31']],Master_Ruangan:[[1,'Ruang Rapat Utama Diskum',50]],Dokumen_Agenda:[[1,JSON.stringify({name:'Notula',url:'https://example.invalid/file'}),'']]};
  const ss={getSheetByName:name=>rows[name]?{getLastRow:()=>rows[name].length+1,getLastColumn:()=>rows[name][0].length,getRange:(row,col,count=1,width=1)=>({getValues:()=>{reads.push(name);return rows[name].slice(row-2,row-2+count).map(r=>r.slice(col-1,col-1+width));},createTextFinder:code=>({matchEntireCell(){return this;},matchCase(){return this;},useRegularExpression(){return this;},findNext:()=>{const i=rows[name].findIndex(r=>String(r[col-1])===String(code));return i<0?null:{getRow:()=>i+2};}})})}:null};
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='ADMIN_DEMO_MODE'?'true':'spreadsheet-id'})},SpreadsheetApp:{openById:()=>{opens++;return ss;}},Utilities:{formatDate:()=> '2026-10-31'}});
  for(const file of ['Code.js','VisitWorkflow.js','VisitWorkflowStorage.js','VisitArchive.js','AgendaDocuments.js','MeetingRooms.js','VisitPicContacts.js'])vm.runInContext(read(file),c);
  const result=c.getVisitWorkflow({kode_kunjungan:'TLD-1'});assert.equal(result.success,true,result.error);assert.equal(opens,1);assert.equal(reads.length,5);assert.ok(!reads.includes('Master_Pegawai'));assert.ok(!reads.includes('Master_OPD'));
});

test('an initial visitor fetch arriving after a save preserves the saved row and other rows',()=>{
  const pending=[],rendered=[],c=vm.createContext({callBackend:(name,args,ok,error)=>pending.push({name,ok,error}),renderTamuTable:rows=>rendered.push(rows),renderMonthlyReport(){},renderRecentTamu(){},refreshVisitSummary(){},refreshVisitCalendar(){}});
  const source=read('Index.html');vm.runInContext('let allTamuData=[],visitListRevision=0,visitListPatches=new Map(),dashboardRequestRevision=0,calendarRequestRevision=0;',c);
  for(const name of ['loadAllDashboard','mergeVisitPatches','applyVisitUpdate'])vm.runInContext(source.match(new RegExp('    function '+name+'\\([^]*?\\n    \\}'))[0],c);
  c.loadAllDashboard({summary:false,calendar:false});c.applyVisitUpdate({visit:{kode_kunjungan:'A',instansi:'New'},workflow:{status:'Sudah Disposisi'}},'disposisi');
  pending[0].ok({success:true,data:[{kode_kunjungan:'A',instansi:'Old',status_kunjungan:'Menunggu Konfirmasi'},{kode_kunjungan:'B'}]});
  assert.equal(rendered.at(-1).length,2);assert.equal(rendered.at(-1)[0].instansi,'New');assert.equal(rendered.at(-1)[0].status_kunjungan,'Sudah Disposisi');
});

test('an older visitor fetch failure cannot erase a successfully saved row',()=>{
  for(const networkError of [false,true]){
    const pending=[],c=vm.createContext({console:{error(){}},callBackend:(name,args,ok,error)=>pending.push({ok,error}),renderTamuTable(){},renderMonthlyReport(){},renderRecentTamu(){},refreshVisitSummary(){},refreshVisitCalendar(){},renderTableState(){},responseMessage:()=> 'Failed',document:{getElementById:()=>({})}});
    const source=read('Index.html');vm.runInContext('let allTamuData=[],visitListRevision=0,visitListPatches=new Map(),dashboardRequestRevision=0,calendarRequestRevision=0;',c);
    for(const name of ['loadAllDashboard','mergeVisitPatches','applyVisitUpdate'])vm.runInContext(source.match(new RegExp('    function '+name+'\\([^]*?\\n    \\}'))[0],c);
    c.loadAllDashboard({summary:false,calendar:false});c.applyVisitUpdate({visit:{kode_kunjungan:'A'},workflow:{status:'Sudah Disposisi'}},'disposisi');
    if(networkError)pending[0].error(new Error('Offline'));else pending[0].ok({success:false});
    assert.equal(vm.runInContext('allTamuData[0]?.status_kunjungan',c),'Sudah Disposisi');
  }
});
