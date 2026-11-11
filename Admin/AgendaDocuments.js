/** E-notula stored separately from agenda columns, preserving existing room/calendar schema. */
function cleanNotulaField_(value) {
  const text=String(value==null?'':value).trim();
  return text==='-'?'':text;
}
function normalizeNotulaName_(value) {
  if(typeof normalizeAttendanceName_==='function')return normalizeAttendanceName_(value);
  return String(value||'').toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim();
}
function readNotulaEmployeeRows_(ss) {
  const sheet=ss&&typeof ss.getSheetByName==='function'?ss.getSheetByName('Master_Pegawai'):null;
  if(sheet&&typeof sheet.getLastRow==='function'&&sheet.getLastRow()>1){
    const width=typeof sheet.getLastColumn==='function'?Math.max(5,Math.min(9,sheet.getLastColumn())):9;
    const rows=sheet.getRange(2,1,sheet.getLastRow()-1,width).getValues();
    const valid=rows
      .filter(r=>String(r[2]||'').trim())
      .map(r=>({nip:cleanNotulaField_(r[1]),nama:String(r[2]||'').trim(),jabatan:cleanNotulaField_(r[3]),bidang:cleanNotulaField_(r[4]),pangkat:cleanNotulaField_(r[8])}));
    if(valid.length)return valid;
  }
  return typeof DISKUM_EMPLOYEE_DIRECTORY!=='undefined'&&Array.isArray(DISKUM_EMPLOYEE_DIRECTORY)
    ?DISKUM_EMPLOYEE_DIRECTORY.map(e=>({nip:cleanNotulaField_(e.nip),nama:String(e.nama||'').trim(),jabatan:cleanNotulaField_(e.jabatan),bidang:cleanNotulaField_(e.bidang),pangkat:cleanNotulaField_(e.pangkat)}))
    :[];
}
function findNotulaEmployeeMatch_(name,employees) {
  const key=normalizeNotulaName_(cleanNotulaField_(name));
  if(!key)return null;
  const list=Array.isArray(employees)?employees:[];
  const found=list.find(e=>normalizeNotulaName_(e.nama)===key);
  if(found){
    return {nama:found.nama,jabatan:cleanNotulaField_(found.jabatan),pangkat:cleanNotulaField_(found.pangkat),nip:cleanNotulaField_(found.nip)};
  }
  if(typeof OFFICIAL_LEADERSHIP_ORDER_!=='undefined'&&Array.isArray(OFFICIAL_LEADERSHIP_ORDER_)){
    const leader=OFFICIAL_LEADERSHIP_ORDER_.find(e=>normalizeNotulaName_(e.nama)===key);
    if(leader)return {nama:leader.nama,jabatan:'',pangkat:'',nip:cleanNotulaField_(leader.nip)};
  }
  return null;
}
function sanitizeNotulaTemplateData_(raw) {
  const src=raw&&typeof raw==='object'?raw:{};
  const keys=[
    ['sidang_rapat',500],['hari_tanggal',200],['surat_undangan',500],['waktu_sidang_rapat',200],
    ['acara',10000],['ketua',300],['sekretaris',300],['pencatat',300],
    ['peserta',20000],['kegiatan',50000],
    ['ttd_jabatan',300],['ttd_nama',300],['ttd_pangkat',200],['ttd_nip',100]
  ];
  const out={};
  keys.forEach(([key,limit])=>{
    out[key]=String(src[key]==null?'':src[key]).replace(/\r\n/g,'\n').slice(0,limit);
  });
  return out;
}
function buildAgendaNotulaContextData_(agenda,attendanceRecords,employees,visitNote) {
  const tz='Asia/Jakarta';
  const list=Array.isArray(attendanceRecords)?attendanceRecords:[];
  const ordered=typeof sortAttendanceRecords_==='function'
    ?sortAttendanceRecords_(list,tz,{employees:employees})
    :list.slice();
  const participants=ordered.map(r=>({
    nama:cleanNotulaField_(r.nama),
    jabatan:cleanNotulaField_(r.jabatan),
    nama_opd:cleanNotulaField_(r.nama_opd||r.bidang),
    kategori:cleanNotulaField_(r.kategori||r.kategori_peserta)
  })).filter(p=>p.nama);
  const pimpinanMatch=findNotulaEmployeeMatch_(agenda.pimpinan_rapat,employees);
  const directory=(Array.isArray(employees)?employees:[]).map(e=>({
    nama:String(e.nama||'').trim(),
    jabatan:cleanNotulaField_(e.jabatan),
    pangkat:cleanNotulaField_(e.pangkat),
    nip:cleanNotulaField_(e.nip)
  })).filter(e=>e.nama);
  return {
    agenda:agenda,
    locked:typeof isMeetingLocked_==='function'?isMeetingLocked_(agenda):Boolean(agenda&&(agenda.locked===true||String(agenda.status||'').trim().toLowerCase()==='terkunci')),
    participants:participants,
    pimpinanMatch:pimpinanMatch,
    employees:directory,
    notula:agenda.notula||null,
    visitNote:String(visitNote||'').trim()
  };
}
function getAgendaNotulaContext(payload) {
  try {
    requireVisitAdmin_();
    const rapatId=payload&&(payload.rapat_id!=null?payload.rapat_id:payload.id);
    const agenda=getRapatCalendar().data.find(r=>String(r.id)===String(rapatId));
    if(!agenda)throw new Error('Agenda rapat tidak ditemukan.');
    if(agenda.status==='Dibatalkan')throw new Error('Agenda yang dibatalkan tidak dapat diubah.');
    const ss=getSpreadsheet();
    const employees=readNotulaEmployeeRows_(ss);
    const attSheet=ss.getSheetByName('Data_Presensi');
    const attWidth=attSheet&&typeof attSheet.getLastColumn==='function'?Math.min(12,attSheet.getLastColumn()||10):10;
    const attRows=attSheet&&attSheet.getLastRow()>1?attSheet.getRange(2,1,attSheet.getLastRow()-1,attWidth).getValues():[];
    const records=attRows
      .filter(row=>String(row[1])===String(agenda.id))
      .map(row=>({id:row[0],kategori:row[3],nama:row[4],nip:row[5],jabatan:row[6],bidang:row[7],waktu:row[9],member_id:row[10]||''}));
    let visitNote='';
    const visitCode=String(agenda.kode_kunjungan||(String(agenda.kode_rapat||'').indexOf('VISIT-')===0?String(agenda.kode_rapat).slice(6):''));
    if(visitCode&&typeof visitWorkflowSheet_==='function'&&typeof findRecordByColumn_==='function'){
      const wfSheet=visitWorkflowSheet_(ss,false);
      const wfRec=wfSheet?findRecordByColumn_(wfSheet,1,visitCode,4):null;
      const wfState=wfRec?JSON.parse(wfRec.values[2]||'{}'):null;
      if(wfState&&wfState.note)visitNote=String(wfState.note||'').trim();
    }
    return {success:true,data:buildAgendaNotulaContextData_(agenda,records,employees,visitNote)};
  }catch(error){return {success:false,error:error.message};}
}
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
    if(payload&&payload.template_data&&typeof payload.template_data==='object'){
      document.generated=true;
      document.template_data=sanitizeNotulaTemplateData_(payload.template_data);
    }
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
