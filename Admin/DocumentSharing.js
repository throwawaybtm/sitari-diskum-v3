/** One-time document-only sharing update authorized for the team demo. */
function ensurePublicVisitDocuments_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('PUBLIC_DOCUMENTS_MIGRATION_V1'))return;
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    if(props.getProperty('PUBLIC_DOCUMENTS_MIGRATION_V1'))return;
    const ss=getSpreadsheet(), ids=new Set(), folders=new Set();
    const addUrl=value=>{
      const match=/^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|document\/d\/|open\?(?:[^#]*&)?id=)([A-Za-z0-9_-]+)/.exec(String(value||''));
      if(match)ids.add(match[1]);
    };
    const rows=name=>{const sheet=ss.getSheetByName(name);return sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues():[];};
    rows('Data_Tamu').forEach(row=>{addUrl(row[14]);addUrl(row[15]);});
    rows('Kendali_SPPD').forEach(row=>[5,6,7].forEach(index=>addUrl(row[index])));
    const scan=value=>{
      if(!value||typeof value!=='object')return;
      if(typeof value.url==='string')addUrl(value.url);
      Object.keys(value).forEach(key=>scan(value[key]));
    };
    rows('Alur_Kunjungan').forEach(row=>{if(row[2])scan(JSON.parse(row[2]));});
    ['FOLDER_SURAT_ID','FOLDER_BUKTI_ID'].forEach(key=>{const id=props.getProperty(key);if(id)folders.add(id);});
    const roots=DriveApp.getFoldersByName(FOLDER_ROOT_NAME);
    while(roots.hasNext()){
      const root=roots.next();
      [FOLDER_SURAT_NAME,FOLDER_BUKTI_NAME].forEach(name=>{const found=root.getFoldersByName(name);while(found.hasNext())folders.add(found.next().getId());});
    }
    const visitFolder=id=>{
      const folder=DriveApp.getFolderById(id), files=folder.getFiles();
      while(files.hasNext())ids.add(files.next().getId());
      const children=folder.getFolders();while(children.hasNext()){const child=children.next();if(!folders.has(child.getId())){folders.add(child.getId());visitFolder(child.getId());}}
    };
    Array.from(folders).forEach(visitFolder);
    const documents=[];
    ids.forEach(id=>{
      if(id===ss.getId())return;
      const file=DriveApp.getFileById(id), mime=file.getMimeType(), name=file.getName();
      if(!(/^(?:image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$|application\/vnd\.google-apps\.document$)/.test(mime))||/\b(?:backup|backups)\b/i.test(name))return;
      documents.push(file);
    });
    // This audit is a separate private file; no folder or database is made public.
    const audit=DriveApp.createFile('SI-TARI Document Permissions Before Public '+Date.now()+'.json',JSON.stringify({at:new Date().toISOString(),files:documents.map(file=>({id:file.getId(),name:file.getName(),access:String(file.getSharingAccess()),permission:String(file.getSharingPermission())}))}),MimeType.PLAIN_TEXT);
    documents.forEach(file=>{
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      if(file.getSharingAccess()!==DriveApp.Access.ANYONE_WITH_LINK||file.getSharingPermission()!==DriveApp.Permission.VIEW)throw new Error('Izin dokumen belum berhasil diperbarui: '+file.getName());
    });
    props.setProperty('PUBLIC_DOCUMENTS_MIGRATION_V1',JSON.stringify({shared:documents.length,auditId:audit.getId(),at:new Date().toISOString()}));
    console.log('SI-TARI document sharing verified: '+documents.length+' files.');
  } finally {lock.releaseLock();}
}
