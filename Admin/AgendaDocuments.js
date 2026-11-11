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
function photoIdentityKey_(photo) {
  if(!photo||typeof photo!=='object')return '';
  const url=String(photo.url||'').trim();
  if(!url)return '';
  if(typeof visitDriveFileId_==='function'){const id=visitDriveFileId_(url);if(id)return 'drive:'+id;}
  return 'url:'+url;
}
function mergeUniquePhotos_(primary,secondary) {
  const out=Array.isArray(primary)?primary.slice():[];
  const seen=new Set(out.map(photoIdentityKey_).filter(Boolean));
  (Array.isArray(secondary)?secondary:[]).forEach(photo=>{
    if(!photo||typeof photo!=='object')return;
    const key=photoIdentityKey_(photo);
    if(key&&seen.has(key))return;
    if(key)seen.add(key);
    out.push(photo);
  });
  return out;
}
function visitPhotoStorageKey_(code) {
  return 'VISIT-'+String(code||'').trim();
}
function getAgendaPhotosMap_(ss) {
  const sheet=(ss||getSpreadsheet()).getSheetByName('Foto_Agenda'),result={};
  if(sheet&&sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().forEach(row=>{
    const key=String(row[0]==null?'':row[0]).trim();
    if(!key)return;
    const parsed=JSON.parse(row[1]||'[]');
    result[key]=result[key]?mergeUniquePhotos_(result[key],parsed):parsed;
  });
  return result;
}
function getAgendaPhotos_(id,ss) {return getAgendaPhotosMap_(ss)[String(id)]||[];}
function writeAgendaPhotosRow_(ss,key,photos) {
  let sheet=ss.getSheetByName('Foto_Agenda');
  if(!sheet){sheet=ss.insertSheet('Foto_Agenda');sheet.appendRow(['Agenda ID','Foto JSON','Diperbarui']);}
  const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues():[];
  const index=rows.findIndex(row=>String(row[0])===String(key)),values=[key,JSON.stringify(photos),new Date().toISOString()];
  if(index>=0)sheet.getRange(index+2,1,1,3).setValues([values]);else sheet.appendRow(values);
}
function transferVisitAgendaPhotos_(ss,fromKey,toKey) {
  const sheet=ss.getSheetByName('Foto_Agenda');
  if(!sheet||sheet.getLastRow()<2)return [];
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues();
  const fromIndexes=[],toIndexes=[];
  rows.forEach((row,idx)=>{
    const k=String(row[0]==null?'':row[0]).trim();
    if(k===String(fromKey))fromIndexes.push(idx);
    if(k===String(toKey))toIndexes.push(idx);
  });
  let toPhotos=[],fromPhotos=[];
  toIndexes.forEach(idx=>{toPhotos=mergeUniquePhotos_(toPhotos,JSON.parse(rows[idx][1]||'[]'));});
  fromIndexes.forEach(idx=>{fromPhotos=mergeUniquePhotos_(fromPhotos,JSON.parse(rows[idx][1]||'[]'));});
  const merged=mergeUniquePhotos_(toPhotos,fromPhotos);
  if(!fromIndexes.length&&toIndexes.length<=1)return merged;
  const now=new Date().toISOString(),keepIdx=toIndexes.length?toIndexes[0]:fromIndexes[0];
  sheet.getRange(keepIdx+2,1,1,3).setValues([[toKey,JSON.stringify(merged),now]]);
  toIndexes.concat(fromIndexes).forEach(idx=>{if(idx!==keepIdx)sheet.getRange(idx+2,1,1,3).setValues([['','[]',now]]);});
  return merged;
}
function consolidateVisitAgendaPhotos_(ss,visitKey,agendaId) {
  return transferVisitAgendaPhotos_(ss,visitKey,agendaId);
}
function detachVisitAgendaPhotos_(ss,kodeRapat,agendaId) {
  if(String(kodeRapat||'').indexOf('VISIT-')!==0)return;
  transferVisitAgendaPhotos_(ss,agendaId,String(kodeRapat));
}
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
    const ss=getSpreadsheet();
    const visitKey=!internal&&String(agenda.kode_rapat||'').indexOf('VISIT-')===0?String(agenda.kode_rapat):'';
    const current=visitKey?consolidateVisitAgendaPhotos_(ss,visitKey,agenda.id):getAgendaPhotos_(agenda.id,ss);
    validateMeetingPhotoBatch_(payload.files,current.length);
    const photos=current.concat(payload.files.map(file=>Object.assign(saveVisitWorkflowFile_(file,agenda.kode_rapat,kind),{label:label})));
    writeAgendaPhotosRow_(ss,agenda.id,photos);
    return {success:true,data:photos};
  }catch(error){return {success:false,error:error.message};}finally{lock.releaseLock();}
}
function readAgendaPhotoDocument_(photos,index) {
  if(!Number.isInteger(index)||index<0||index>=photos.length)throw new Error('Foto tidak ditemukan.');
  const photo=photos[index],id=visitDriveFileId_(photo.url);
  if(!id)throw new Error('Tautan foto tidak valid.');
  const file=DriveApp.getFileById(id),blob=file.getBlob(),mime=blob.getContentType();
  if(!mime.startsWith('image/'))throw new Error('Dokumen bukan foto.');
  return {name:photo.name||file.getName(),mime:mime,base64:Utilities.base64Encode(blob.getBytes())};
}
function getAgendaPhotoDocument(payload) {
  try {
    requireVisitAdmin_();
    const agenda=getRapatCalendar().data.find(row=>String(row.id)===String(payload.rapat_id));
    if(!agenda)throw new Error('Agenda rapat tidak ditemukan.');
    const photosMap=getAgendaPhotosMap_(getSpreadsheet());
    const rowPhotos=photosMap[String(agenda.id)]||[];
    const visitKey=!isInternalMeeting_(agenda)&&String(agenda.kode_rapat||'').indexOf('VISIT-')===0?String(agenda.kode_rapat):'';
    const photos=visitKey&&photosMap[visitKey]?mergeUniquePhotos_(rowPhotos,photosMap[visitKey]):rowPhotos;
    return {success:true,data:readAgendaPhotoDocument_(photos,payload.index)};
  }catch(error){return {success:false,error:error.message};}
}
function findActiveVisitAgenda_(code) {
  const key=visitPhotoStorageKey_(code);
  return getRapatCalendar().data.find(row=>row.status!=='Dibatalkan'&&(String(row.kode_rapat||'')===key||String(row.kode_kunjungan||'')===String(code)))||null;
}
function saveTddPhotos(payload) {
  let lock;
  try {
    requireVisitAdmin_();
    lock=LockService.getScriptLock();lock.waitLock(30000);
    const code=String(payload&&payload.kode_kunjungan||'').trim();
    const ss=getSpreadsheet(),visit=code?getVisitByCode_(ss,code):null;
    if(!visit||!isTddVisit_(visit))throw new Error('Kunjungan tamu dalam daerah tidak ditemukan.');
    const agenda=findActiveVisitAgenda_(code),visitKey=visitPhotoStorageKey_(code);
    if(agenda){
      if(agenda.status==='Dibatalkan')throw new Error('Agenda yang dibatalkan tidak dapat diubah.');
      if(agenda.status==='Ditunda')throw new Error('Agenda rapat berstatus Ditunda. Jadwalkan ulang terlebih dahulu sebelum mengunggah dokumentasi.');
      if(isMeetingLocked_(agenda))throw new Error('Agenda rapat sudah dikunci. Foto bersifat hanya-baca.');
    }
    const storageKey=agenda?agenda.id:visitKey;
    const current=agenda?consolidateVisitAgendaPhotos_(ss,visitKey,agenda.id):getAgendaPhotos_(visitKey,ss);
    validateMeetingPhotoBatch_(payload&&payload.files,current.length);
    const saveCode=agenda&&agenda.kode_rapat?agenda.kode_rapat:visitKey;
    const photos=current.concat(payload.files.map(file=>Object.assign(saveVisitWorkflowFile_(file,saveCode,'foto-kunjungan'),{label:'Foto Agenda Kunjungan'})));
    writeAgendaPhotosRow_(ss,storageKey,photos);
    if(agenda)agenda.photos=photos;
    return {success:true,data:{visit:visit,agenda:agenda,photos:photos,locked:Boolean(agenda&&isMeetingLocked_(agenda)),simulated:false}};
  }catch(error){return {success:false,error:error.message};}finally{if(lock)lock.releaseLock();}
}
function getTddPhotoDocument(payload) {
  try {
    requireVisitAdmin_();
    const code=String(payload&&payload.kode_kunjungan||'').trim();
    const ss=getSpreadsheet(),visit=code?getVisitByCode_(ss,code):null;
    if(!visit||!isTddVisit_(visit))throw new Error('Kunjungan tamu dalam daerah tidak ditemukan.');
    const agenda=findActiveVisitAgenda_(code),photosMap=getAgendaPhotosMap_(ss),visitKey=visitPhotoStorageKey_(code);
    const photos=agenda?mergeUniquePhotos_(photosMap[String(agenda.id)]||[],photosMap[visitKey]||[]):(photosMap[visitKey]||[]);
    return {success:true,data:readAgendaPhotoDocument_(photos,payload&&payload.index)};
  }catch(error){return {success:false,error:error.message};}
}
