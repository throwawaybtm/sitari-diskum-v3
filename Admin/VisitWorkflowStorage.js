/** GAS storage adapter. Local tests use local-test/visit-workflow.js instead. */
function requireVisitAdmin_() {
  const properties = PropertiesService.getScriptProperties();
  // Explicitly enabled for the pre-release team demo; set false before launch.
  if (properties.getProperty('ADMIN_DEMO_MODE') === 'true') return;
  const email = Session.getActiveUser().getEmail();
  const configured = properties.getProperty('APPROVER_EMAIL');
  if (configured && email && email.toLowerCase() === configured.trim().toLowerCase()) return;
  if (!configured) throw new Error('Akses admin belum diatur. Atur APPROVER_EMAIL pada Script Properties.');
  throw new Error('Akun ini belum diberi akses admin. Masuk dengan akun admin yang ditugaskan.');
}

function visitWorkflowSheet_(ss, create) {
  let sheet = ss.getSheetByName('Alur_Kunjungan');
  if (!sheet && create) {
    sheet = ss.insertSheet('Alur_Kunjungan');
    sheet.appendRow(['Kode Kunjungan', 'Versi', 'Data Alur JSON', 'Diperbarui']);
  }
  return sheet;
}

function readVisitWorkflow_(code, spreadsheet, options) {
  const ss = spreadsheet || getSpreadsheet();
  const visit = getVisitByCode_(ss,code);
  if (!visit) throw new Error('Kunjungan tidak ditemukan.');
  const sheet = visitWorkflowSheet_(ss, false);
  const found=findRecordByColumn_(sheet,1,code,4);
  const workflow = found ? JSON.parse(found.values[2]) : newVisitWorkflow_(visit);
  if (!found) {
    const old = findRecordByColumn_(ss.getSheetByName('Kendali_SPPD'),3,code);
    if (old) ['foto','absen','notulen'].forEach((kind,index) => {
      if (old.values[5+index]) workflow.files[kind] = {name:kind,url:old.values[5+index]};
    });
  }
  const attendanceSheet = !options||options.attendance!==false?ss.getSheetByName('Data_Presensi'):null;
  const attendanceRows = (!options||options.attendance!==false) && workflow.booking && attendanceSheet && attendanceSheet.getLastRow() > 1
    ? attendanceSheet.getRange(2,1,attendanceSheet.getLastRow()-1,attendanceSheet.getLastColumn()).getValues() : [];
  const attendance = attendanceRows.filter(row => String(row[1]) === String(workflow.booking.id))
    .map(row => ({nama:row[4],jabatan:row[6]||'-',nama_opd:row[7],member_id:row[10]||'',source:row[11]||'QR',waktu:row[9] instanceof Date ? Utilities.formatDate(row[9],'Asia/Jakarta','dd-MM-yyyy HH:mm') : String(row[9])}));
  return { visit:visit, workflow:workflow, stage:visitWorkflowStage_(workflow), attendance:attendance,
    roster:getVisitRoster_(visit).map(member=>Object.assign({},member,{attended:hasVisitAttendance_(attendance,{member_id:member.id,nama:member.nama})})),
    rooms:!options||options.rooms!==false?readMeetingRoomOptions_(ss):[], simulated:false, storageRow:found?found.row:null };
}

function getVisitWorkflow(payload) {
  try {
    requireVisitAdmin_();
    const limited=payload.tab!==undefined;
    if(limited&&payload.tab!=='current'&&(!Number.isInteger(payload.tab)||payload.tab<0||payload.tab>5))throw new Error('Tab kunjungan tidak valid.');
    const ss=getSpreadsheet(),data = readVisitWorkflow_(payload.kode_kunjungan,ss,limited?{attendance:false,rooms:false}:undefined); delete data.storageRow;
    if(limited){
      const tab=payload.tab==='current'?data.stage:payload.tab;
      if(data.workflow.status!=='Selesai'&&tab>data.stage||data.workflow.status==='Non-SPPD'&&tab!==0)throw new Error('Tahap belum tersedia.');
      if(tab===2)data.rooms=readCachedMeetingRoomOptions_(ss);
      if(tab===3||tab===4){
        const sheet=ss.getSheetByName('Data_Presensi');
        const rows=data.workflow.booking&&sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues():[];
        data.attendance=rows.filter(r=>String(r[1])===String(data.workflow.booking.id)).map(r=>({nama:r[4],jabatan:r[6]||'-',nama_opd:r[7],member_id:r[10]||'',source:r[11]||'QR',waktu:r[9] instanceof Date?Utilities.formatDate(r[9],'Asia/Jakarta','dd-MM-yyyy HH:mm'):String(r[9])}));
        data.roster=getVisitRoster_(data.visit).map(member=>Object.assign({},member,{attended:hasVisitAttendance_(data.attendance,{member_id:member.id,nama:member.nama})}));
      }
      data.tab=tab;data.loadedTabs=[tab];data.limited=true;
    }
    data.notula=!limited||data.tab===5?getAgendaNotula_(data.workflow.booking&&data.workflow.booking.id,ss):null;
    data.archiveSources=!limited||data.tab===5?visitArchiveSources_(data,data.notula):[];
    data.destinations=VISIT_PIC_CONTACTS.map(d=>({bidang:d.bidang,pic:d.pic}));
    return {success:true,data:data};
  } catch(error) { return {success:false,error:error.message}; }
}

function saveVisitWorkflow(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    requireVisitAdmin_();
    const code = String(payload.kode_kunjungan || ''), ss = getSpreadsheet(), data = readVisitWorkflow_(code,ss);
    const recipients = String(data.visit.lo_nama || '').split(';').map(s=>s.trim()).filter(Boolean);
    const actor = getApprovalActor_();
    const env = {
      now:new Date().toISOString(), actor:actor, recipients:recipients, attendance:data.attendance,rooms:data.rooms,
      saveFile:(file,kind)=>saveVisitWorkflowFile_(file,code,kind),
      notify:previous=>notifyVisitPics_(data.visit,previous,data.workflow.schedule||{}),
      notifyContact:previous=>previous&&previous.success?previous:sendVisitWhatsapp_(data.visit.narahubung_hp,visitWhatsappMessage_(data.visit,data.workflow.schedule||{},'contact')),
      reschedule:schedule=>schedule,
      selectDestinations:names=>chooseVisitDestinations_(names,VISIT_PIC_CONTACTS),
      generateAttendance:()=>generateVisitAttendancePdf_(data),
      book:booking=>bookVisitAgenda_(data.visit,booking,data.rooms)
    };
    const state = applyVisitWorkflow_(data.visit,data.workflow,payload,env);
    const workflowSheet = visitWorkflowSheet_(ss,true);
    const values = [code,state.version,JSON.stringify(state),env.now];
    if (data.storageRow) workflowSheet.getRange(data.storageRow,1,1,4).setValues([values]);
    else workflowSheet.appendRow(values);
    const visitorSheet=ss.getSheetByName('Data_Tamu');
    const visitorRecord=findRecordByColumn_(visitorSheet,2,code,20);
    if(visitorRecord) {
      visitorSheet.getRange(visitorRecord.row,20).setValue(state.status);
      if(payload.action==='reschedule')visitorSheet.getRange(visitorRecord.row,13,1,2).setNumberFormat('@').setValues([[state.schedule.tanggal,state.schedule.jam]]);
      if(payload.action==='book')visitorSheet.getRange(visitorRecord.row,13,1,2).setValues([[state.booking.tanggal,state.booking.jam_mulai]]);
      if(payload.action==='destinations'){
        visitorSheet.getRange(visitorRecord.row,9).setValue(state.destinations.bidang);
        visitorSheet.getRange(visitorRecord.row,17,1,2).setValues([[state.destinations.picIds,state.destinations.pic]]);
      }
    }
    syncVisitSppdEvidence_(ss,code,state);
    SpreadsheetApp.flush();
    const result=readVisitWorkflow_(code,ss);delete result.storageRow;
    result.notula=getAgendaNotula_(state.booking&&state.booking.id,ss);result.archiveSources=visitArchiveSources_(result,result.notula);
    result.destinations=VISIT_PIC_CONTACTS.map(d=>({bidang:d.bidang,pic:d.pic}));
    return {success:true,data:result};
  } catch(error) { return {success:false,error:error.message}; }
  finally { lock.releaseLock(); }
}

function saveVisitWorkflowFile_(file,code,kind) {
  const info=validateVisitFile_(file), props=PropertiesService.getScriptProperties();
  let folderId=props.getProperty('FOLDER_BUKTI_ID');
  if(!folderId) folderId=setupGoogleDriveFolders().buktiId;
  const extension=info.mime==='application/pdf'?'pdf':info.mime.split('/')[1];
  const name=kind+'_'+code+'_'+Utilities.getUuid()+'.'+extension;
  const blob=Utilities.newBlob(Utilities.base64Decode(file.data.split(',')[1]),info.mime,name);
  const saved=DriveApp.getFolderById(folderId).createFile(blob);
  saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {name:file.name||name,url:saved.getUrl(),mime:info.mime,size:info.size};
}

function bookVisitAgenda_(visit,booking,rooms) {
  const ss=getSpreadsheet(), sheet=ss.getSheetByName('Data_Rapat');
  const meetings=getRapatCalendar().data, key='VISIT-'+visit.kode_kunjungan;
  const existing=meetings.find(m=>m.kode_rapat===key);
  if(existing) {
    if(String(existing.ruangan_id)===String(booking.ruangan_id)&&existing.tanggal===booking.tanggal&&existing.jam_mulai===booking.jam_mulai&&existing.jam_selesai===booking.jam_selesai) return existing;
    throw new Error('Agenda kunjungan sudah memiliki pemesanan ruangan. Muat ulang data.');
  }
  const checked=validateVisitBooking_(booking,visit,rooms,meetings);
  const allIds=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().map(row=>row[0]):[];
  const id=nextVisitAgendaId_(allIds);
  const title='Kunjungan '+visit.instansi;
  appendMeetingRow_(sheet,[id,key,title,checked.ruangan_id,checked.nama_ruangan,checked.tanggal,checked.jam_mulai,checked.jam_selesai,visit.tujuan_bidang,visit.lo_nama,visit.jumlah_orang,visit.keperluan,'Terjadwal',Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd HH:mm:ss')]);
  return Object.assign({},checked,{id:id,kode_rapat:key,judul_rapat:title,kode_kunjungan:visit.kode_kunjungan});
}

function syncVisitSppdEvidence_(ss,code,state) {
  const sheet=ss.getSheetByName('Kendali_SPPD');
  if(!sheet||sheet.getLastRow()<=1)return;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  const index=rows.findIndex(row=>String(row[2])===code);if(index<0)return;
  if(state.files.foto)sheet.getRange(index+2,6).setValue(state.files.foto.url);
  if(state.files.absen)sheet.getRange(index+2,7).setValue(state.files.absen.url);
  if(state.status==='Selesai')sheet.getRange(index+2,9).setValue('Sah & Terverifikasi');
}

function rejectLegacyVisitSppd_(sppdId) {
  const control=getSppdList().data.find(item=>String(item.id)===String(sppdId));
  if(control&&getTamuList().data.some(v=>v.tipe_tamu==='luar_daerah'&&String(v.kode_kunjungan)===String(control.kode_kunjungan))) {
    throw new Error('Gunakan modal EDIT kunjungan untuk alur dokumen dan pengesahan fisik.');
  }
}

function validateVisitAttendanceWrite_(meetingId) {
  const sheet=visitWorkflowSheet_(getSpreadsheet(),false);
  if(!sheet||sheet.getLastRow()<=1)return;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues();
  const state=rows.map(row=>JSON.parse(row[2])).find(w=>w.booking&&String(w.booking.id)===String(meetingId));
  if(state&&(state.arrival||state.status==='Selesai'))throw new Error('Presensi kunjungan sudah divalidasi.');
}

function visitAttendanceForAgenda_(meeting) {
  const code=meeting.kode_kunjungan||(String(meeting.kode_rapat||'').indexOf('VISIT-')===0?String(meeting.kode_rapat).slice(6):'');
  return code?readVisitWorkflow_(code):null;
}

function getVisitAttendanceRoster(payload) {
  try {
    const meeting=getRapatCalendar().data.find(m=>String(m.id)===String(payload.rapat_id));
    const data=meeting&&visitAttendanceForAgenda_(meeting);
    if(!data||!data.workflow.booking||String(data.workflow.booking.id)!==String(meeting.id))throw new Error('Agenda kunjungan tidak ditemukan.');
    return {success:true,data:{rapat_id:meeting.id,instansi:data.visit.instansi,roster:data.roster,locked:Boolean(data.workflow.arrival||data.workflow.status==='Selesai')}};
  } catch(error) {return {success:false,error:error.message};}
}

function submitManualVisitAttendance(payload) {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    requireVisitAdmin_();
    const meeting=getRapatCalendar().data.find(m=>String(m.id)===String(payload.rapat_id));
    const availability=adminAttendanceAvailability_(meeting);if(!availability.open)throw new Error(availability.message);
    const data=meeting&&visitAttendanceForAgenda_(meeting);
    if(!data||!data.workflow.booking||String(data.workflow.booking.id)!==String(meeting.id))throw new Error('Agenda kunjungan tidak ditemukan.');
    if(data.workflow.arrival||data.workflow.status==='Selesai')throw new Error('Presensi kunjungan sudah divalidasi.');
    const ids=[...new Set(Array.isArray(payload.member_ids)?payload.member_ids:[])];
    if(!ids.length)throw new Error('Pilih minimal satu nama dari daftar rombongan.');
    const people=ids.map(id=>resolveVisitAttendee_(data.visit,{member_id:id}));
    people.forEach(person=>{const result=savePresensiRapat_(Object.assign({},person,{rapat_id:meeting.id,jabatan:String(payload.member_jobs&&payload.member_jobs[person.member_id]||'').trim().slice(0,150)}),'Admin');if(!result.success)throw new Error(result.error);});
    const updated=readVisitWorkflow_(data.visit.kode_kunjungan);delete updated.storageRow;
    return {success:true,data:updated};
  } catch(error) {return {success:false,error:error.message};}
  finally {lock.releaseLock();}
}
