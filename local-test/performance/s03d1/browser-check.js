/* Owned local test postlude only, not part of the emitted GAS assembly. */
window.s03d1Check=async()=>{
 const wait=async(fn)=>{const start=performance.now();while(!fn()){if(performance.now()-start>15000)throw Error('Check timeout');await new Promise(r=>setTimeout(r,20));}};
 let checks=0;const check=value=>{if(!value)throw Error('Read check failed');checks++;};
 if(typeof initializeApp==='function'){
  await wait(()=>allTamuData.length===200&&allRapatData.length===200);check(document.querySelectorAll('#tamuTableBody tr').length===200);
  for(const name of ['dashboard','tamu','calendar','qrcode'])switchTab(name);check(!document.getElementById('section-qrcode').classList.contains('hidden'));
  await openVisitWorkflow('S02-VISIT-2');check(Boolean(visitModalData));for(let i=0;i<6;i++){await selectVisitTab(i);check(visitModalTab===i);}closeVisitWorkflow();
  openAgendaAttendance('1');await wait(()=>document.querySelectorAll('#agendaAttendanceRows tr').length===5);check(!document.getElementById('agendaAttendanceError').textContent);closeAgendaAttendance();
  openMeetingPhotos('1');check(document.querySelectorAll('#meetingPhotoList img').length===1);document.getElementById('meetingPhotosModal').close();
  await openManualVisitAttendance('2');check(!document.getElementById('manualVisitAttendance').hidden);closeManualVisitAttendance();
  const read=await new Promise((ok,fail)=>callBackend('getAgendaPhotoDocument',[{rapat_id:1,index:0}],ok,fail));check(read.success&&read.data.mime==='image/png');
  let denied=false;window.__s03dBridge.withFailureHandler(()=>denied=true).saveVisitWorkflow({action:'finish'});check(denied);
 }else if(document.getElementById('formPresensi')){
  await wait(()=>document.querySelectorAll('#selectRapat option').length>1);check(document.querySelectorAll('#selectRapat option').length>1);
  const master=await new Promise((ok,fail)=>callBackend('getMasterData',[],ok,fail));check(master.success&&master.data.pegawai.length===70);
  const roster=await new Promise((ok,fail)=>callBackend('getVisitAttendanceRoster',[{rapat_id:2}],ok,fail));check(roster.success);
  let denied=false;window.__s03dBridge.withFailureHandler(()=>denied=true).submitPresensiRapat({});check(denied);
 }else{
  check(Boolean(document.querySelector('form')));if(document.getElementById('formTamuFo'))check(document.querySelectorAll('#foBidangOptions input').length===9);
  let denied=false;window.__s03dBridge.withFailureHandler(()=>denied=true).registerTamuLuar({});check(denied);
 }
 return checks;
};
