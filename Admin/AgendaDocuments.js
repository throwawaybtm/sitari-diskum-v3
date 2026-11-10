/** E-notula stored separately from agenda columns, preserving existing room/calendar schema. */
function getAgendaNotula_(id,spreadsheet) {
  if(!id)return null;
  const sheet=(spreadsheet||getSpreadsheet()).getSheetByName('Dokumen_Agenda');
  if(!sheet||sheet.getLastRow()<2)return null;
  const row=sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().find(r=>String(r[0])===String(id));
  return row?JSON.parse(row[1]):null;
}
function saveAgendaNotula(payload) {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    requireVisitAdmin_();const agenda=getRapatCalendar().data.find(r=>String(r.id)===String(payload.rapat_id));
    if(!agenda)throw new Error('Agenda tidak ditemukan.');
    const internal=isInternalMeeting_(agenda);
    if(agenda.status==='Dibatalkan')throw new Error('Agenda yang dibatalkan tidak dapat diubah.');
    if(agenda.status==='Ditunda')throw new Error('Agenda rapat berstatus Ditunda. Jadwalkan ulang terlebih dahulu sebelum mengunggah E-notula.');
    if(isMeetingLocked_(agenda))throw new Error('Agenda rapat sudah dikunci. E-notula bersifat hanya-baca.');
    if(internal&&!getAgendaPhotos_(agenda.id).length)throw new Error('Unggah minimal satu foto rapat sebelum menyelesaikan agenda melalui E-notula.');
    validateVisitFile_(payload.file);
    const document=saveVisitWorkflowFile_(payload.file,agenda.kode_rapat,'e-notula');
    const ss=getSpreadsheet();let sheet=ss.getSheetByName('Dokumen_Agenda');
    if(!sheet){sheet=ss.insertSheet('Dokumen_Agenda');sheet.appendRow(['Agenda ID','Dokumen JSON','Diperbarui']);}
    const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
    const index=rows.findIndex(r=>String(r[0])===String(agenda.id));const values=[agenda.id,JSON.stringify(document),new Date().toISOString()];
    if(index>=0)sheet.getRange(index+2,1,1,3).setValues([values]);else sheet.appendRow(values);
    const calendar=ss.getSheetByName('Data_Rapat'),agendas=calendar.getRange(2,1,calendar.getLastRow()-1,1).getValues();
    const agendaIndex=agendas.findIndex(r=>String(r[0])===String(agenda.id));
    if(agendaIndex>=0)calendar.getRange(agendaIndex+2,13).setValue('Selesai');
    return {success:true,data:document};
  }catch(error){return {success:false,error:error.message};}finally{lock.releaseLock();}
}

function isInternalMeeting_(agenda) {
  return !agenda.kode_kunjungan&&!String(agenda.kode_rapat||'').startsWith('VISIT-');
}
function getAgendaPhotosMap_(ss) {
  const sheet=(ss||getSpreadsheet()).getSheetByName('Foto_Agenda'),result={};
  if(sheet&&sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().forEach(row=>{result[String(row[0])]=JSON.parse(row[1]||'[]');});
  return result;
}
function getAgendaPhotos_(id,ss) {return getAgendaPhotosMap_(ss)[String(id)]||[];}
function getAgendaScheduleHistoryMap_(ss) {
  const sheet=(ss||getSpreadsheet()).getSheetByName('Riwayat_Agenda'),result={};
  if(sheet&&sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().forEach(row=>{result[String(row[0])]=JSON.parse(row[1]||'[]');});
  return result;
}
function appendAgendaScheduleHistory_(ss,id,entry) {
  let sheet=ss.getSheetByName('Riwayat_Agenda');
  if(!sheet){sheet=ss.insertSheet('Riwayat_Agenda');sheet.appendRow(['Agenda ID','Riwayat JSON','Diperbarui']);}
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
  const index=rows.findIndex(row=>String(row[0])===String(id));
  const current=index>=0?JSON.parse(rows[index][1]||'[]'):[];
  const next=current.concat([entry]);
  const values=[id,JSON.stringify(next),new Date().toISOString()];
  if(index>=0)sheet.getRange(index+2,1,1,3).setValues([values]);else sheet.appendRow(values);
  return next;
}
function validateMeetingPhotoBatch_(files,existingCount) {
  if(!Array.isArray(files)||!files.length||files.length>5)throw new Error('Pilih 1–5 foto setiap unggahan.');
  if((existingCount||0)+files.length>10)throw new Error('Maksimal 10 foto per agenda.');
  let total=0;
  files.forEach(file=>{const info=validateVisitFile_(file);if(!info.mime.startsWith('image/'))throw new Error('Dokumentasi rapat harus berupa foto.');total+=info.size;});
  if(total>10*1024*1024)throw new Error('Total foto setiap unggahan maksimal 10 MB.');
}
function saveAgendaPhotos(payload) {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    requireVisitAdmin_();
    const agenda=getRapatCalendar().data.find(row=>String(row.id)===String(payload.rapat_id));
    if(!agenda)throw new Error('Agenda tidak ditemukan.');
    if(agenda.status==='Dibatalkan')throw new Error('Agenda yang dibatalkan tidak dapat diubah.');
    if(agenda.status==='Ditunda')throw new Error('Agenda rapat berstatus Ditunda. Jadwalkan ulang terlebih dahulu sebelum mengunggah dokumentasi.');
    if(isMeetingLocked_(agenda))throw new Error('Agenda rapat sudah dikunci. Foto bersifat hanya-baca.');
    const internal=isInternalMeeting_(agenda),kind=internal?'foto-rapat':'foto-kunjungan',label=internal?'Foto Rapat Internal':'Foto Agenda Kunjungan';
    const ss=getSpreadsheet(),current=getAgendaPhotos_(agenda.id,ss);
    validateMeetingPhotoBatch_(payload.files,current.length);
    const photos=current.concat(payload.files.map(file=>Object.assign(saveVisitWorkflowFile_(file,agenda.kode_rapat,kind),{label:label})));
    let sheet=ss.getSheetByName('Foto_Agenda');
    if(!sheet){sheet=ss.insertSheet('Foto_Agenda');sheet.appendRow(['Agenda ID','Foto JSON','Diperbarui']);}
    const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
    const index=rows.findIndex(row=>String(row[0])===String(agenda.id)),values=[agenda.id,JSON.stringify(photos),new Date().toISOString()];
    if(index>=0)sheet.getRange(index+2,1,1,3).setValues([values]);else sheet.appendRow(values);
    return {success:true,data:photos};
  }catch(error){return {success:false,error:error.message};}finally{lock.releaseLock();}
}
function getAgendaPhotoDocument(payload) {
  try {
    requireVisitAdmin_();
    const agenda=getRapatCalendar().data.find(row=>String(row.id)===String(payload.rapat_id));
    if(!agenda)throw new Error('Agenda rapat tidak ditemukan.');
    const photos=getAgendaPhotos_(agenda.id);
    if(!Number.isInteger(payload.index)||payload.index<0||payload.index>=photos.length)throw new Error('Foto tidak ditemukan.');
    const photo=photos[payload.index],id=visitDriveFileId_(photo.url);
    if(!id)throw new Error('Tautan foto tidak valid.');
    const file=DriveApp.getFileById(id),blob=file.getBlob(),mime=blob.getContentType();
    if(!mime.startsWith('image/'))throw new Error('Dokumen bukan foto.');
    return {success:true,data:{name:photo.name||file.getName(),mime: mime,base64:Utilities.base64Encode(blob.getBytes())}};
  }catch(error){return {success:false,error:error.message};}
}
