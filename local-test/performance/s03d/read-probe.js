'use strict';
// Removable capability/timing module. No global service access, logging or deployment.
function createReadProbe(config,raw,options) {
  const fail=()=>{throw new Error('S03D read unavailable');};
  if(!config||typeof config.spreadsheetId!=='string'||!config.spreadsheetId||!Array.isArray(config.documentIds))fail();
  // Capture immutable allowlists; modifying the caller's config cannot expand them.
  const database=config.spreadsheetId,documents=new Set(config.documentIds),clock=options&&options.clock||(()=>Date.now());
  const tables=new Set(['Data_Tamu','Data_Rapat','Data_Presensi','Kendali_SPPD','Master_Pegawai','Master_OPD','Master_Ruangan','Alur_Kunjungan','Dokumen_Agenda','Foto_Agenda']);
  const labels=new Set(['handler','sheet.open','sheet.metadata','sheet.values','sheet.display','sheet.find','drive.metadata','drive.blob','transform','serialization']);
  const reads=new Set(['getDashboardSummary','getTamuList','getRapatCalendar','getVisitWorkflow','getAgendaAttendance','getVisitArchiveDocument','getAgendaPhotoDocument','getMeetingRoomOptions','getMasterData','getPublicEmployeeCount','getPublicFormDestinations','getPublicAttendanceCalendar','getPublicAttendanceMasterData','getVisitAttendanceRoster']);
  let events=[],depth=0,used=false;
  function guarded(methods){return new Proxy(Object.freeze(methods),{get:(target,key)=>Object.prototype.hasOwnProperty.call(target,key)?target[key]:fail()});}
  function span(label,fn,counts){
    if(!labels.has(label))fail();if(counts&&['rows','cells'].some(k=>!Number.isInteger(counts[k])||counts[k]<0))fail();const start=clock(),level=depth++;let ok=0;
    try{const value=fn();ok=1;return value;}catch{fail();}finally{depth--;const event={label,depth:level,durationMs:Math.max(0,clock()-start),ok};
      if(counts)for(const k of ['rows','cells']){if(!Number.isInteger(counts[k])||counts[k]<0)fail();event[k]=counts[k];}events.push(event);}
  }
  function found(cell){return cell?guarded({getRow:()=>span('sheet.metadata',()=>cell.getRow())}):null;}
  function finder(value){const f={};for(const name of ['matchEntireCell','matchCase','useRegularExpression'])f[name]=arg=>{span('sheet.metadata',()=>value[name](arg));return f;};f.findNext=()=>found(span('sheet.find',()=>value.findNext()));return guarded(f);}
  function range(value,rows,cols){return guarded({getValues:()=>span('sheet.values',()=>value.getValues(),{rows,cells:rows*cols}),getDisplayValues:()=>span('sheet.display',()=>value.getDisplayValues(),{rows,cells:rows*cols}),createTextFinder:query=>finder(span('sheet.metadata',()=>value.createTextFinder(query)))});}
  function sheet(value,parent){return value?guarded({getLastRow:()=>span('sheet.metadata',()=>value.getLastRow()),getLastColumn:()=>span('sheet.metadata',()=>value.getLastColumn()),getParent:()=>parent,
    getRange:(row,col,rows,cols)=>{if(![row,col,rows,cols].every(n=>Number.isInteger(n)&&n>0))fail();return range(span('sheet.metadata',()=>value.getRange(row,col,rows,cols)),rows,cols);}}):null;}
  function spreadsheet(value){let wrapped;wrapped=guarded({getId:()=>database,getSpreadsheetTimeZone:()=>span('sheet.metadata',()=>value.getSpreadsheetTimeZone()),getSheetByName:name=>{if(!tables.has(name))fail();return sheet(span('sheet.metadata',()=>value.getSheetByName(name)),wrapped);}});return wrapped;}
  function blob(value){if(!['application/pdf','image/png','image/jpeg'].includes(span('drive.metadata',()=>value.getContentType())))fail();return guarded({getContentType:()=>span('drive.metadata',()=>value.getContentType()),getBytes:()=>span('drive.blob',()=>value.getBytes())});}
  const services=guarded({SpreadsheetApp:guarded({openById:id=>{if(id!==database)fail();return spreadsheet(span('sheet.open',()=>raw.SpreadsheetApp.openById(id)));}}),DriveApp:guarded({getFileById:id=>{
    if(!documents.has(id))fail();const file=span('drive.metadata',()=>raw.DriveApp.getFileById(id));
    return guarded({getName:()=>span('drive.metadata',()=>file.getName()),getMimeType:()=>span('drive.metadata',()=>file.getMimeType()),getBlob:()=>blob(span('drive.blob',()=>file.getBlob()))});
  }})});
  function run(method,fn){
    if(!reads.has(method)||used)fail();used=true;events=[];let errors=0,value;
    try{value=span('handler',fn);if(value&&value.success===false){errors++;value={success:false,error:'S03D read failed'};}}catch{errors++;value={success:false,error:'S03D read failed'};}
    let json;span('serialization',()=>{json=JSON.stringify(value);});
    const utf8Bytes=encodeURIComponent(json).replace(/%[A-F\d]{2}|./g,'x').length;
    return {value,metrics:{method,handlerMs:events.find(e=>e.label==='handler').durationMs,serializationMs:events.find(e=>e.label==='serialization').durationMs,payloadBytes:utf8Bytes,errors,events:events.map(e=>Object.assign({},e))}};
  }
  return Object.freeze({services,getSpreadsheet:()=>services.SpreadsheetApp.openById(database),span,run});
}
if(typeof module!=='undefined')module.exports={createReadProbe};
