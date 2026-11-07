/** One-time, backup-first import into the existing Master_Pegawai schema. */
function buildEmployeeMasterRows_(existing,directory) {
  const nip=value=>String(value||'').replace(/\s/g,'').replace(/^-$/,'');
  const name=value=>String(value||'').toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim();
  const used=new Set(),picNames=typeof VISIT_PIC_CONTACTS==='undefined'?[]:VISIT_PIC_CONTACTS.map(p=>name(p.pic));
  let next=existing.reduce((max,row)=>Math.max(max,Number(row[0])||0),0)+1;
  const width=Math.max(9,...existing.map(row=>row.length));
  return directory.map(person=>{
    const old=existing.find(row=>!used.has(String(row[0]))&&nip(person.nip)&&nip(row[1])===nip(person.nip))||existing.find(row=>!used.has(String(row[0]))&&name(row[2])===name(person.nama));
    const id=old?old[0]:next++;used.add(String(id));
    const row=[id,person.nip||'',person.nama,person.jabatan,person.bidang,old&&old[5]!==''&&old[5]!=null?old[5]:(picNames.includes(name(person.nama))?1:0),old?Number(old[6])||0:0,old&&old[7]?old[7]:'Aktif',person.pangkat||''];
    while(row.length<width)row.push(old?old[row.length]||'':'');return row;
  });
}
function ensureEmployeeDirectory_() {
  const props=PropertiesService.getScriptProperties(),key='DISKUM_EMPLOYEE_IMPORT_20261030_70_V1';
  const saved=props.getProperty(key);if(saved)return JSON.parse(saved);
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const existing=props.getProperty(key);if(existing)return JSON.parse(existing);
    const ss=getSpreadsheet(),sheet=ss.getSheetByName('Master_Pegawai');if(!sheet)throw new Error('Master_Pegawai tidak ditemukan.');
    const original=sheet.getDataRange().getValues(),directory=DISKUM_EMPLOYEE_DIRECTORY;
    if(directory.length!==70||new Set(directory.map(p=>p.nama)).size!==70)throw new Error('Daftar pegawai tidak valid.');
    const rows=buildEmployeeMasterRows_(original.slice(1),directory),departments=new Set(rows.map(r=>r[4]));
    if(departments.size!==9||new Set(rows.map(r=>String(r[0]))).size!==70)throw new Error('Bidang atau ID pegawai tidak valid.');
    const backup=ss.copy('SI-TARI Backup Before Employee Import '+Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd HHmmss'));
    if(DriveApp.getFileById(backup.getId()).getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('Backup pegawai harus privat.');
    if(JSON.stringify(backup.getSheetByName('Master_Pegawai').getDataRange().getValues())!==JSON.stringify(original)||JSON.stringify(sheet.getDataRange().getValues())!==JSON.stringify(original))throw new Error('Verifikasi backup pegawai gagal.');
    try{
      const headers=original[0].slice();while(headers.length<9)headers.push('');headers[8]='Pangkat / Golongan';
      sheet.getRange(1,1,1,headers.length).setValues([headers]);
      sheet.getRange(2,1,Math.max(original.length-1,rows.length),rows[0].length).clearContent();
      sheet.getRange(2,2,rows.length,1).setNumberFormat('@');
      sheet.getRange(2,1,rows.length,rows[0].length).setValues(rows);SpreadsheetApp.flush();
      if(sheet.getLastRow()!==71||JSON.stringify(sheet.getRange(2,1,70,rows[0].length).getValues())!==JSON.stringify(rows))throw new Error('Verifikasi impor pegawai gagal.');
      const result={count:70,departments:9,withoutNip:rows.filter(r=>!r[1]).length,backupUrl:backup.getUrl(),at:new Date().toISOString()};props.setProperty(key,JSON.stringify(result));if(typeof invalidateMasterReadCache_==='function')invalidateMasterReadCache_(ss);return result;
    }catch(error){sheet.clearContents();sheet.getRange(1,1,original.length,original[0].length).setValues(original);SpreadsheetApp.flush();throw error;}
  }finally{lock.releaseLock();}
}
