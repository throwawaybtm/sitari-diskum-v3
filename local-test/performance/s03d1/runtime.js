'use strict';
function makeStagingRuntime_(cfg,makeCore,createProbe,env,view){
 const deny=()=>{throw Error('S03D1 read unavailable');};
 const publicCore=new Set(['getPublicEmployeeCount','getPublicFormDestinations','getPublicAttendanceMasterData','getPublicAttendanceCalendar','getVisitAttendanceRoster']);
 function identity(){const id=env.ScriptApp.getScriptId();if(![cfg.adminProjectId,cfg.publicProjectId].includes(id))deny();}
 function safeUrls(value){if(typeof value==='string'&&/^https?:/i.test(value)){
  const match=/^https:\/\/drive\.google\.com\/file\/d\/([-\w]+)\/(?:view|preview)$/.exec(value);if(!match||!cfg.documentIds.includes(match[1]))deny();
 }else if(value&&typeof value==='object')Object.values(value).forEach(safeUrls);return value;}
 function checkPayload(name,p){
  if(p===undefined||p===null)return;const keys=name==='getVisitWorkflow'?['kode_kunjungan','tab']:['getVisitArchiveDocument'].includes(name)?['kode_kunjungan','index']:['getAgendaAttendance','getVisitAttendanceRoster','getAgendaPhotoDocument'].includes(name)?['rapat_id','index']:[];
  if(name==='getPublicFormDestinations'){if(!['tld','tdd'].includes(p))deny();return;}
  if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!keys.includes(k))||JSON.stringify(p).length>2000||Object.values(p).some(v=>!['string','number'].includes(typeof v)||typeof v==='string'&&(/[<>\r\n]|https?:|@/.test(v))))deny();
 }
 function admin(name,p){
  checkPayload(name,p);const probe=createProbe(cfg,env),core=makeCore(probe,cfg,env);
  if(!publicCore.has(name))core.requireVisitAdmin_();
  const parameterized=['getVisitWorkflow','getVisitAttendanceRoster','getAgendaAttendance','getVisitArchiveDocument','getAgendaPhotoDocument','getPublicFormDestinations'].includes(name);
  const out=probe.run(name,()=>{const value=parameterized?core[name](p):core[name]();return safeUrls(value);});
  if(out.value&&typeof out.value==='object'&&!Array.isArray(out.value))return Object.assign({},out.value,{_s03d:out.metrics});return out.value;
 }
 function rpc(role,name,p){
  try{identity();if(role!==view.role||!(role==='Admin'?view.adminReads:view.publicReads).includes(name))deny();
   if(role==='Admin')return admin(name,p);
   checkPayload(name,p);const target={getMasterData:'getPublicAttendanceMasterData',getRapatCalendar:'getPublicAttendanceCalendar',getVisitAttendanceRoster:'getVisitAttendanceRoster'}[name];
   return safeUrls(env.SiTariCore[target](p));
  }catch{return {success:false,error:'S03D1 read unavailable'};}
 }
 function page(role,e){identity();if(role!==view.role)deny();let name,adminAttendance=false;
  const route=String(e&&e.parameter&&e.parameter.page||'');
  if(role==='Admin'){if(!['','index','presensi','presensi-admin'].includes(route))deny();adminAttendance=route==='presensi-admin';name=route.startsWith('presensi')?'Presensi':'Index';
   const probe=createProbe(cfg,env);makeCore(probe,cfg,env).requireVisitAdmin_();
  }else{name=({'':'Tld',tld:'Tld','tamu-luar':'Tld',tdd:'Tdd','tamu-fo':'Tdd',presensi:'Presensi'})[route];if(!name)deny();}
  const template=env.HtmlService.createTemplateFromFile(name),id=String(e&&e.parameter&&e.parameter.id||'');if(!/^[-\w]{0,100}$/.test(id))deny();
  template.rapatId=id;template.adminAttendance=adminAttendance;template.adminAppUrl=cfg.adminUrl;template.appUrl=cfg.publicUrl;template.tamuFoUrl=cfg.publicUrl+'?page=tdd';template.tamuLuarUrl=cfg.publicUrl+'?page=tld';template.employeeImportCount=role==='Public'&&name==='Presensi'?env.SiTariCore.getPublicEmployeeCount():70;
  // Public UI directories are fetched only through the bounded library API.
  template.tddDestinations=role==='Public'&&name==='Tdd'?env.SiTariCore.getPublicFormDestinations('tdd'):[];
  template.meetingRooms=view.rooms;
  template.include=include;template.include_=include;template.includeOrganizationStructure_=()=>include('OrganizationStructure');
  const result=template.evaluate();const content=result.getContent();
  const bootstrap=env.HtmlService.createHtmlOutputFromFile('StageGuard').getContent().replace('S03D1_CONFIG_JSON',JSON.stringify({role,reads:role==='Admin'?view.adminReads:view.publicReads,local:cfg.mode==='local-synthetic',adminUrl:cfg.adminUrl,publicUrl:cfg.publicUrl,documentIds:cfg.documentIds}));
  return env.HtmlService.createHtmlOutput(content.replace(/\b(?:window\.)?google\.script\.run\b/g,'window.__s03dBridge').replace('<head>','<head>'+bootstrap)).setTitle(role==='Admin'?'SI-TARI DISKUM':'SI-TARI DISKUM - Formulir').addMetaTag('viewport','width=device-width, initial-scale=1');
 }
 function include(name){if(!view.htmlNames.includes(name)||name==='StageGuard')deny();return env.HtmlService.createHtmlOutputFromFile(name).getContent();}
 return Object.freeze({rpc,page});
}
if(typeof module!=='undefined')module.exports={makeStagingRuntime_};
