'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'../../',file),'utf8');
test('document migration shares only project documents, preserves database/backups, and runs once',()=>{
  const files={},changes=[],props={},audits=[];
  for(const [id,mime,name] of [['letter','application/pdf','Surat.pdf'],['photo','image/png','Foto.png'],['database','application/vnd.google-apps.spreadsheet','DB'],['backup','application/zip','Backup.zip']])files[id]={getId:()=>id,getMimeType:()=>mime,getName:()=>name,getSharingAccess:()=>changes.includes(id)?'ANYONE_WITH_LINK':'PRIVATE',getSharingPermission:()=>changes.includes(id)?'VIEW':'NONE',setSharing:(access,permission)=>{assert.equal(access,'ANYONE_WITH_LINK');assert.equal(permission,'VIEW');changes.push(id);}};
  const row=Array(21).fill('');row[14]='https://drive.google.com/file/d/letter/view';row[15]='https://drive.google.com/file/d/database/view';
  const sheet={getLastRow:()=>2,getLastColumn:()=>21,getRange:()=>({getValues:()=>[row]})};
  const iterator=values=>{let i=0;return {hasNext:()=>i<values.length,next:()=>values[i++]};};
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key],setProperty:(key,value)=>props[key]=value})},getSpreadsheet:()=>({getId:()=> 'database',getSheetByName:name=>name==='Data_Tamu'?sheet:null}),LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},DriveApp:{Access:{ANYONE_WITH_LINK:'ANYONE_WITH_LINK'},Permission:{VIEW:'VIEW'},getFileById:id=>files[id],getFolderById:()=>({getFiles:()=>iterator([files.photo,files.backup,files.database]),getFolders:()=>iterator([])}),getFoldersByName:()=>iterator([]),createFile:(name,content,mime)=>{audits.push(JSON.parse(content));return {getId:()=> 'private-audit'};}},MimeType:{PLAIN_TEXT:'text/plain'},console});
  props.FOLDER_SURAT_ID='project-folder';
  c.FOLDER_ROOT_NAME='SI-TARI';c.FOLDER_SURAT_NAME='Surat';c.FOLDER_BUKTI_NAME='Bukti';
  vm.runInContext(read('Admin/DocumentSharing.js'),c);
  c.ensurePublicVisitDocuments_();
  assert.deepEqual(changes.sort(),['letter','photo']);assert.equal(audits.length,1);assert.equal(audits[0].files.length,2);
  assert.ok(audits[0].files.every(f=>f.access==='PRIVATE'));
  assert.equal(JSON.parse(props.PUBLIC_DOCUMENTS_MIGRATION_V1).shared,2);
  c.ensurePublicVisitDocuments_();assert.equal(changes.length,2);assert.equal(audits.length,1);
});
test('future TLD letters and workflow evidence receive public read-only link access',()=>{
  for(const file of ['Tamu-Luar/Code.js','Admin/VisitWorkflowStorage.js'])assert.match(read(file),/\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK, DriveApp\.Permission\.VIEW\)/);
});
