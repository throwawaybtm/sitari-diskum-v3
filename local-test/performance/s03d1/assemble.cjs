'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto');
const {knownProductionIds}=require('../s03d/preflight.cjs');
const {isImmutableVersion}=require('../s03d/immutable-version.cjs');
const SOURCE='d1d02475acba50439835c8fcc5b163828897e9ea',ROOT=path.resolve(__dirname,'../../..');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const cache=new Map();function pinned(file){if(!cache.has(file))cache.set(file,cp.execFileSync('git',['show',SOURCE+':'+file],{encoding:'utf8',maxBuffer:4*1024*1024}));return cache.get(file);}
const ADMIN_READS=['getDashboardSummary','getTamuList','getRapatCalendar','getMasterData','getMeetingRoomOptions','getVisitWorkflow','getVisitAttendanceRoster','getAgendaAttendance','getVisitArchiveDocument','getAgendaPhotoDocument','getPublicEmployeeCount','getPublicFormDestinations','getPublicAttendanceMasterData','getPublicAttendanceCalendar'];
const PUBLIC_READS=['getMasterData','getRapatCalendar','getVisitAttendanceRoster'];
const FUNCTIONS={
 'Code.js':['formatDateVal','formatTimeVal','normalizeMeetingTime_','readMeetingRows_','getDashboardSummary','readDashboardData_','getMasterData','readMasterData_','getTamuList','mapVisitRow_','findRecordByColumn_','getVisitByCode_','getRapatCalendar'],
 'MeetingRooms.js':['meetingRoomName_','normalizeMeetingRooms_','readMeetingRoomOptions_','readCachedMeetingRoomOptions_','getMeetingRoomOptions'],
 'VisitWorkflow.js':['newVisitWorkflow_','visitWorkflowStage_','normalizeVisitName_','getVisitRoster_','hasVisitAttendance_'],
 'VisitWorkflowStorage.js':['requireVisitAdmin_','readVisitWorkflow_','getVisitWorkflow','visitAttendanceForAgenda_','getVisitAttendanceRoster'],
 'AgendaDocuments.js':['getAgendaNotula_','getAgendaPhotosMap_','getAgendaPhotos_','isInternalMeeting_','getAgendaPhotoDocument'],
 'AgendaAttendanceData.js':['agendaAttendanceTime_','makeAgendaAttendanceList_','getAgendaAttendance'],
 'VisitArchive.js':['visitDriveFileId_','visitArchiveSources_','getVisitArchiveDocument'],
 'PublicApi.js':['getPublicEmployeeCount','getPublicAttendanceMasterData','getPublicAttendanceCalendar']
};
function localConfig(){return {mode:'local-synthetic',adminProjectId:'s03d1-admin',publicProjectId:'s03d1-public',publicLibraryId:'s03d1-admin',publicLibraryVersion:'1',spreadsheetId:'s03d1-db',documentIds:['s03d1-pdf','s03d1-png'],approverEmail:'staging@example.invalid',adminUrl:'http://127.0.0.1:4176/admin',publicUrl:'http://127.0.0.1:4176/public'};}
function validate(c){
 const keys=Object.keys(localConfig());if(!c||Object.keys(c).length!==keys.length||Object.keys(c).some(k=>!keys.includes(k)))throw Error('S03D1 config rejected');
 if(!Array.isArray(c.documentIds))throw Error('S03D1 config rejected');const ids=[c.adminProjectId,c.publicProjectId,c.spreadsheetId,...c.documentIds];
 if(!['local-synthetic','future-staging'].includes(c.mode)||!Array.isArray(c.documentIds)||!c.documentIds.length||ids.some(v=>typeof v!=='string'||!/^[-\w]{3,200}$/.test(v))||new Set(ids).size!==ids.length||ids.some(id=>knownProductionIds().includes(id))||c.publicLibraryId!==c.adminProjectId||!isImmutableVersion(c.publicLibraryVersion)||!/^[-\w.+]+@[-\w.]+$/.test(c.approverEmail))throw Error('S03D1 config rejected');
 for(const [key,role]of [['adminUrl','admin'],['publicUrl','public']]){
  const url=new URL(c[key]);if(c.mode==='local-synthetic'){if(c[key]!==`http://127.0.0.1:4176/${role}`)throw Error('S03D1 URL rejected');}
  else if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c[key])||knownProductionIds().some(id=>c[key].includes(id)))throw Error('S03D1 URL rejected');
 }
 if(c.adminUrl===c.publicUrl)throw Error('S03D1 URLs must be separate');return JSON.parse(JSON.stringify(c));
}
function assemble(input){
 const cfg=validate(input),inventory={sourceCommit:SOURCE,exports:{Admin:['doGet',...ADMIN_READS],Public:['doGet',...PUBLIC_READS]},functions:[],sources:[],artifacts:{}};
 const ctx=vm.createContext({});for(const file of Object.keys(FUNCTIONS)){const source=pinned('Admin/'+file);inventory.sources.push({path:'Admin/'+file,sha256:sha(source)});vm.runInContext(source,ctx,{timeout:1000});}
 const definitions=[];for(const [file,names]of Object.entries(FUNCTIONS))for(const name of names){if(typeof ctx[name]!=='function')throw Error('S03D1 pinned function absent');const body=ctx[name].toString();if(/\.(?:setValue|setValues|appendRow|createFile|setSharing|insertSheet|setProperty|fetch|flush)\s*\(/.test(body))throw Error('S03D1 unexpected mutation');definitions.push(body);inventory.functions.push({name,path:'Admin/'+file,sha256:sha(body)});}
 const rooms=vm.runInContext('JSON.stringify(MEETING_ROOM_DIRECTORY)',ctx);
 const core=`function makeCore_(p,cfg,env){
 const SpreadsheetApp=p.services.SpreadsheetApp,DriveApp=p.services.DriveApp;
 const Utilities=Object.freeze({formatDate:(...args)=>env.Utilities.formatDate(...args),base64Encode:bytes=>env.Utilities.base64Encode(bytes)});
 const Session=Object.freeze({getActiveUser:()=>Object.freeze({getEmail:()=>env.Session.getActiveUser().getEmail()})});
 const PropertiesService=Object.freeze({getScriptProperties:()=>Object.freeze({getProperty:key=>key==='ADMIN_DEMO_MODE'?'false':key==='APPROVER_EMAIL'?cfg.approverEmail:null})});
 const MEETING_ROOM_DIRECTORY=${rooms},DISKUM_EMPLOYEE_DIRECTORY=Array.from({length:70},(_,i)=>({nama:'Synthetic employee '+i}));
 const VISIT_PIC_CONTACTS=Array.from({length:9},(_,i)=>({id:'synthetic-'+i,bidang:'Synthetic department '+i,pic:'Synthetic PIC '+i}));
 function getSpreadsheet(){const ss=p.getSpreadsheet();for(const name of ['Data_Tamu','Data_Rapat','Data_Presensi','Kendali_SPPD','Master_Pegawai','Master_OPD','Master_Ruangan','Alur_Kunjungan','Dokumen_Agenda','Foto_Agenda'])if(!ss.getSheetByName(name))throw Error('S03D1 missing table');return ss;}
 function cachedMasterRead_(ss,kind,read){return read();}
 function visitWorkflowSheet_(ss,create){if(create)throw Error('S03D1 read only');const sheet=ss.getSheetByName('Alur_Kunjungan');if(!sheet)throw Error('S03D1 missing workflow table');return sheet;}
 function getPublicFormDestinations(kind){if(!['tld','tdd'].includes(kind))throw Error('S03D1 destination rejected');return VISIT_PIC_CONTACTS.map(d=>({id:d.id,bidang:d.bidang,pic:d.pic}));}
 ${definitions.join('\n')}
 return Object.freeze({${ADMIN_READS.join(',')},requireVisitAdmin_,meetingRooms:MEETING_ROOM_DIRECTORY});}`;
 const readProbe=fs.readFileSync(path.join(__dirname,'../s03d/read-probe.js'),'utf8').split("if(typeof module")[0].replace('function createReadProbe(','function createReadProbe_(');
 const runtime=fs.readFileSync(path.join(__dirname,'runtime.js'),'utf8').split("if(typeof module")[0];
 const entries=role=>`\nfunction doGet(e){return S03D_.page(${JSON.stringify(role)},e);}\n`+(role==='Admin'?ADMIN_READS:PUBLIC_READS).map(name=>`function ${name}(payload){return S03D_.rpc(${JSON.stringify(role)},${JSON.stringify(name)},payload);}`).join('\n');
 const files={Admin:{},Public:{}};
 for(const role of ['Admin','Public']){
  const list=cp.execFileSync('git',['ls-tree','--name-only',SOURCE,role+'/'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.html'));
  for(const file of list){files[role][path.basename(file)]=pinned(file);inventory.sources.push({path:file,sha256:sha(pinned(file))});}
  const env=role==='Admin'?'{SpreadsheetApp,DriveApp,Session,Utilities,HtmlService,ScriptApp}':'{SiTariCore,Session,HtmlService,ScriptApp}';
  files[role]['Code.js']=`${role==='Admin'?readProbe+'\n'+core:''}\n${runtime}\nconst S03D_=makeStagingRuntime_(${JSON.stringify(cfg)},${role==='Admin'?'makeCore_,createReadProbe_':'null,null'},${env},${JSON.stringify({role,adminReads:role==='Admin'?ADMIN_READS:[],publicReads:PUBLIC_READS,rooms:JSON.parse(rooms),htmlNames:Object.keys(files[role]).map(s=>s.slice(0,-5))})});${entries(role)}`;
  files[role]['StageGuard.html']=fs.readFileSync(path.join(__dirname,'guard.html'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,`../s03d/appsscript.${role.toLowerCase()}.json.example`),'utf8'));
  if(role==='Public')manifest.dependencies.libraries[0]={userSymbol:'SiTariCore',libraryId:cfg.publicLibraryId,version:cfg.publicLibraryVersion,developmentMode:false};
  files[role]['appsscript.json']=JSON.stringify(manifest,null,2);
  for(const [name,body]of Object.entries(files[role]))inventory.artifacts[role+'/'+name]=sha(body);
 }
 inventory.tools=Object.fromEntries(['assemble.cjs','runtime.js','guard.html','../s03d/read-probe.js','../s03d/browser-probe.js','../s03d/preflight.cjs','../s03d/immutable-version.cjs'].map(file=>[file,sha(fs.readFileSync(path.join(__dirname,file),'utf8'))]));
 return {...files,inventory,config:cfg};
}
function write(assembly,target=path.join(ROOT,'outputs/performance-s03d1/assembly')){
 const root=path.resolve(target),base=path.join(ROOT,'outputs/performance-s03d1');
 function safe(file){const full=path.resolve(file);if(!full.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('S03D1 private output rejected');let part=ROOT;for(const name of path.relative(ROOT,full).split(path.sep)){part=path.join(part,name);let stat;try{stat=fs.lstatSync(part);}catch(error){if(error.code!=='ENOENT')throw error;}if(stat&&stat.isSymbolicLink())throw Error('S03D1 linked output rejected');}return full;}
 safe(root);fs.mkdirSync(root,{recursive:true});
 // Validate the complete target list before writing any output file.
 const entries=[];for(const role of ['Admin','Public']){safe(path.join(root,role));for(const [name,body]of Object.entries(assembly[role]))entries.push([safe(path.join(root,role,name)),body]);}
 entries.push([safe(path.join(root,'inventory.private.json')),JSON.stringify(assembly.inventory,null,2)],[safe(path.join(root,'config.private.json')),JSON.stringify(assembly.config,null,2)]);
 for(const role of ['Admin','Public'])fs.mkdirSync(path.join(root,role),{recursive:true});for(const [file,body]of entries)fs.writeFileSync(file,body);return root;
}
if(require.main===module){try{let cfg=localConfig();if(process.argv[2]){const input=fs.realpathSync(process.argv[2]),base=fs.realpathSync(path.join(ROOT,'outputs/performance-s03d1'));if(!input.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('Private input required');cfg=JSON.parse(fs.readFileSync(input,'utf8'));}write(assemble(cfg));console.log('Wrote private local assembly; no cloud action or deployment approval.');}catch{console.error('S03D1 assembly rejected; no cloud action attempted.');process.exitCode=1;}}
module.exports={assemble,localConfig,ADMIN_READS,PUBLIC_READS,pinned,SOURCE,write};
