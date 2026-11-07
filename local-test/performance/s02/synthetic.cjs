'use strict';
// Executes tracked backend functions only. No Apps Script connection or private config.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'../../..');
const SOURCES=['Code.js','MeetingRooms.js','AgendaDocuments.js','VisitWorkflow.js','VisitWorkflowStorage.js','VisitArchive.js','PublicApi.js'];
const READS=new Set(['getDashboardData','getTamuList','getRapatCalendar','getVisitWorkflow','getVisitArchiveDocument','getMeetingRoomOptions','getMasterData']);
function guarded(name,methods={}) {
  return new Proxy(methods,{get(target,key){if(key in target)return target[key];throw Error('blocked service: '+name+'.'+String(key));}});
}
function createEnvironment({size=20,profile='representative',countJoins=false}={}) {
  if(!Number.isInteger(size)||size<3||size>10000)throw Error('size must be 3..10000');
  if(!['dense','representative'].includes(profile))throw Error('unknown profile');
  const dense=profile==='dense', values={};let metrics;
  const statuses=['Menunggu Konfirmasi','Menunggu Kedatangan','Selesai','Sudah Disposisi','Kelola SPPD','Non-SPPD'];
  const doc={name:'Synthetic document',url:'https://drive.google.com/file/d/s02-synthetic-document/view'};
  values.Data_Tamu=Array.from({length:size},(_,i)=>[i+1,'S02-VISIT-'+i,!dense&&i%6===5?'dalam_daerah_fo':'luar_daerah','Synthetic institution '+i,'Synthetic address',3,'Synthetic person '+i,'Synthetic member','Synthetic department','Synthetic agenda '+i,'','',dense||i%7===0?'2026-11-07':'2026-10-'+String(i%28+1).padStart(2,'0'),'09:00',i===2?doc.url:'','','','Synthetic PIC',true,dense?'Menunggu Kedatangan':statuses[i%6],'']);
  values.Data_Rapat=values.Data_Tamu.map((v,i)=>[i+1,!dense&&i%2?'VISIT-'+v[1]:'S02-RPT-'+i,'Synthetic agenda '+i,1,'Ruang Rapat Utama Diskum',v[12],'09:00','10:00','Synthetic department','Synthetic PIC',3,'Synthetic agenda','Terjadwal','']);
  values.Data_Presensi=Array.from({length:size*5},(_,i)=>[i+1,i%size+1,'Synthetic agenda','Internal','Synthetic person '+i,'','Synthetic role','Synthetic agency','','2026-11-07 09:00:00','',!dense&&i%3===0?'Admin':'QR','']);
  values.Master_Pegawai=Array.from({length:70},(_,i)=>[i+1,'','Synthetic employee '+i,'Synthetic role','Synthetic department',1,0,'Aktif','']);
  values.Master_OPD=[[1,'Synthetic agency','Synthetic group']];
  values.Master_Ruangan=[[1,'Ruang Rapat Utama Diskum',50,'','Lantai 1','blue']];
  values.Kendali_SPPD=values.Data_Tamu.map((v,i)=>[i+1,i+1,v[1],'','','','','','Belum Lengkap']);
  values.Dokumen_Agenda=values.Data_Rapat.filter((_,i)=>dense||i%3===0).map(r=>[r[0],JSON.stringify(doc),'']);
  values.Foto_Agenda=values.Data_Rapat.filter((_,i)=>dense||i%4===0).map(r=>[r[0],JSON.stringify([doc]),'']);
  values.Alur_Kunjungan=values.Data_Tamu.map((v,i)=>[v[1],1,JSON.stringify({version:1,status:v[19],booking:i%6===0&&!dense?null:{id:i+1,tanggal:v[12],jam_mulai:'09:00',jam_selesai:'10:00',ruangan_id:1,nama_ruangan:'Ruang Rapat Utama Diskum'},files:{},history:[],notifications:[]}),'']);
  const timed=fn=>{const start=performance.now();try{return fn();}finally{metrics.mockServiceMs+=performance.now()-start;}};
  function sheet(name){
    const rows=values[name];if(!rows)return null;
    return guarded('sheet',{getLastRow:()=>rows.length+1,getLastColumn:()=>rows[0]?.length||1,getParent:()=>ss,
      getRange(row,col,count=1,width=1){
        if(row<2||col<1||count<1||width<1)throw Error('blocked range');
        function read(display){return timed(()=>{
          metrics.reads.push({table:name,kind:display?'display':'values',rows:count,cells:count*width});
          const result=rows.slice(row-2,row-2+count).map(r=>Array.from({length:width},(_,i)=>display?String(r[col-1+i]??''):(r[col-1+i]??'')));
          if(countJoins&&name==='Dokumen_Agenda')for(const method of ['some','find'])Object.defineProperty(result,method,{value:function(callback){return Array.prototype[method].call(this,(...args)=>{metrics.documentComparisons++;return callback(...args);});}});
          return result;
        });}
        return guarded('range',{getValues:()=>read(false),getDisplayValues:()=>read(true),createTextFinder(code){
          const finder=guarded('finder',{matchEntireCell:()=>finder,matchCase:()=>finder,useRegularExpression:()=>finder,findNext:()=>timed(()=>{
            metrics.textFinders++;const index=rows.findIndex(r=>String(r[col-1])===String(code));
            return index<0?null:guarded('found',{getRow:()=>index+2});
          })});return finder;
        }});
      }});
  }
  const ss=guarded('spreadsheet',{getId:()=> 's02-synthetic-db',getSheetByName:sheet,getSpreadsheetTimeZone:()=> 'Asia/Jakarta'});
  const services={
    PropertiesService:guarded('PropertiesService',{getScriptProperties:()=>guarded('properties',{getProperty:key=>{
      if(key==='ADMIN_DEMO_MODE')return 'true';if(key==='SPREADSHEET_ID')return 's02-synthetic-db';return null;
    }})}),
    SpreadsheetApp:guarded('SpreadsheetApp',{openById:id=>{if(id!=='s02-synthetic-db')throw Error('blocked spreadsheet ID');metrics.opens++;return ss;}}),
    DriveApp:guarded('DriveApp',{getFileById:id=>{
      if(id!=='s02-synthetic-document')throw Error('blocked Drive ID');metrics.driveFileReads++;
      return guarded('file',{getBlob:()=>guarded('blob',{getContentType:()=> 'application/pdf',getBytes:()=>[37,80,68,70]}),getName:()=> 'Synthetic document'});
    }}),
    UrlFetchApp:guarded('UrlFetchApp'),CacheService:guarded('CacheService'),LockService:guarded('LockService'),Session:guarded('Session'),HtmlService:guarded('HtmlService'),
    Utilities:guarded('Utilities',{formatDate:(_date,_tz,format)=>format==='HH:mm'?'09:00':format==='yyyy-MM-dd HH:mm:ss'?'2026-11-07 09:00:00':'2026-11-07',base64Encode:bytes=>Buffer.from(bytes).toString('base64')})
  };
  const context=vm.createContext({...services,Date,VISIT_PIC_CONTACTS:[],console:guarded('console')});
  for(const file of SOURCES)vm.runInContext(fs.readFileSync(path.join(ROOT,'Admin',file),'utf8'),context,{filename:file});
  function measure(method,payload){
    if(!READS.has(method))throw Error('RPC not allowed: '+method);
    metrics={opens:0,reads:[],textFinders:0,documentComparisons:0,driveFileReads:0,mockServiceMs:0};
    const heapBefore=process.memoryUsage().heapUsed,start=performance.now();
    const result=context[method](payload),handlerVmMs=performance.now()-start;
    if(!result.success)throw Error(method+' failed: '+result.error);
    const serialStart=performance.now(),json=JSON.stringify(result),serializationMs=performance.now()-serialStart;
    return {result,metrics:{...metrics,rangeReads:metrics.reads.length,returnedRows:metrics.reads.reduce((s,r)=>s+r.rows,0),cells:metrics.reads.reduce((s,r)=>s+r.cells,0),attendanceRowsFetched:metrics.reads.filter(r=>r.table==='Data_Presensi').reduce((s,r)=>s+r.rows,0),handlerVmMs,jsResidualMs:handlerVmMs-metrics.mockServiceMs,serializationMs,payloadBytes:Buffer.byteLength(json),heapDeltaBytes:process.memoryUsage().heapUsed-heapBefore}};
  }
  return {measure,services,values,context};
}
module.exports={createEnvironment,ROOT,SOURCES};
