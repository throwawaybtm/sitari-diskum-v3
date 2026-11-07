'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createHarness,renderTemplate,createServer}=require('./local.cjs');
const {ADMIN_READS,PUBLIC_READS,pinned}=require('./assemble.cjs');
const strip=html=>html.replace(/<script data-s03d1-guard>[^]*?<\/script>\n?/,'').replace(/\r\n/g,'\n');
test('all staging routes retain exact evaluated pinned static markup/styles, no unresolved template variables',()=>{
 const h=createHarness();for(const [role,routes]of [['admin',['','index','presensi','presensi-admin']],['public',['','tld','tamu-luar','tdd','tamu-fo','presensi']]])for(const page of routes){
  const html=h[role].doGet({parameter:{page,id:'2'}}).getContent(),record=h.rendered.at(-1);
  const expected=renderTemplate(pinned(record.role+'/'+record.name+'.html'),record.context).replace(/\b(?:window\.)?google\.script\.run\b/g,'window.__s03dBridge');
  assert.equal(strip(html),expected.replace(/\r\n/g,'\n'));assert.ok(!html.includes('<?'));
  assert.doesNotMatch(html,/https:\/\/script\.google\.com\/macros\/s\//);
 }
 for(const role of ['admin','public'])assert.throws(()=>h[role].doGet({parameter:{page:'setup'}}));
});
test('all allowed reads and every workflow tab work; public projection excludes admin documents and approval data',()=>{
 const h=createHarness();for(const name of ['getDashboardSummary','getTamuList','getRapatCalendar','getMasterData','getMeetingRoomOptions'])assert.equal(h.admin[name]().success,true,name);
 assert.equal(h.admin.getTamuList({}).success,true,'empty browser argument must not become a spreadsheet handle');
 for(const tab of [0,1,2,3,4,5,'current']){const r=h.admin.getVisitWorkflow({kode_kunjungan:'S02-VISIT-2',tab});assert.equal(r.success,true,'tab '+tab);assert.ok(r.data.loadedTabs.length);}
 for(const [method,payload]of [['getVisitAttendanceRoster',{rapat_id:2}],['getAgendaAttendance',{rapat_id:1}],['getVisitArchiveDocument',{kode_kunjungan:'S02-VISIT-2',index:0}],['getAgendaPhotoDocument',{rapat_id:1,index:0}]])assert.equal(h.admin[method](payload).success,true,method);
 assert.equal(h.admin.getPublicEmployeeCount(),70);assert.equal(h.admin.getPublicFormDestinations('tdd').length,9);
 for(const name of PUBLIC_READS){const r=h.public[name](name==='getVisitAttendanceRoster'?{rapat_id:2}:{});assert.equal(r.success,true,name);assert.doesNotMatch(JSON.stringify(r),/surat_kunjungan_file|archiveSources|APPROVER|notifications|base64|narahubung_hp/);}
 assert.equal(h.admin.getAgendaAttendance({rapat_id:1}).data.total,5);
});
test('actual exported functions are read-only, real authorization denies another account and no mutation/global service path exists',()=>{
 const h=createHarness();for(const [role,reads]of [['admin',ADMIN_READS],['public',PUBLIC_READS]]){
  assert.deepEqual(Object.keys(h[role]).filter(k=>typeof h[role][k]==='function'&&!k.endsWith('_')).sort(),['doGet',...reads].sort());
  for(const name of ['saveVisitWorkflow','registerTamuLuar','submitPresensiRapat','simpanJadwalRapat','configureNewDeployment_','ensurePublicVisitDocuments_','setupGoogleDriveFolders'])assert.equal(typeof h[role][name],'undefined');
 }
 const original=JSON.stringify(h.tables);h.state.email='someone-else@example.invalid';assert.throws(()=>h.admin.doGet({parameter:{}}));
 for(const name of ADMIN_READS.filter(n=>!['getPublicEmployeeCount','getPublicFormDestinations','getPublicAttendanceMasterData','getPublicAttendanceCalendar','getVisitAttendanceRoster'].includes(n)))assert.equal(h.admin[name]({}).success,false,name);
 assert.equal(JSON.stringify(h.tables),original);
 h.state.scriptId='not-staging';assert.equal(h.public.getMasterData().success,false);assert.throws(()=>h.public.doGet({parameter:{}}));
});
test('wrong document resources, URLs, payload injection, missing tables and incompatible document MIME fail closed',()=>{
 const h=createHarness();const original=JSON.stringify(h.tables);h.tables.Data_Tamu[2][14]='https://drive.google.com/file/d/production-id/view';assert.equal(h.admin.getTamuList().success,false);assert.equal(h.state.files,0);
 assert.equal(h.admin.getVisitArchiveDocument({kode_kunjungan:'S02-VISIT-2',index:0}).success,false);assert.equal(h.state.files,0);
 assert.equal(h.admin.getVisitWorkflow({kode_kunjungan:'S02-VISIT-2',action:'finish'}).success,false);
 assert.equal(h.admin.getTamuList({spreadsheetId:'other'}).success,false);
 h.state.mimeOverride='application/vnd.google-apps.document';h.tables.Data_Tamu[2][14]='https://drive.google.com/file/d/'+h.cfg.documentIds[0]+'/view';assert.equal(h.admin.getVisitArchiveDocument({kode_kunjungan:'S02-VISIT-2',index:0}).success,false);
 delete h.tables.Data_Tamu;assert.equal(h.admin.getRapatCalendar().success,false);assert.equal(h.tables.Data_Tamu,undefined);
 assert.ok(original.length>0);
});
test('complete datasets remain available at all synthetic cohort sizes',()=>{
 for(const size of [20,200,1000]){const h=createHarness({size});assert.equal(h.admin.getTamuList().data.length,size);assert.equal(h.admin.getRapatCalendar().data.length,size);assert.equal(h.admin.getDashboardSummary().data.stats.totalTamu,size);}
});
test('local HTTP serves every page using synthetic services, rejects wrong host and every write RPC for both roles',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{for(const route of ['/admin','/admin?page=presensi-admin','/public?page=tld','/public?page=tdd','/public?page=presensi&id=2']){const r=await fetch(base+route);assert.equal(r.status,200,route);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);}
  for(const role of ['Admin','Public'])for(const name of ['saveVisitWorkflow','registerTamuFo','registerTamuLuar','submitPresensiRapat','submitAdminPresensiRapat','saveAgendaPhotos','saveAgendaNotula','simpanJadwalRapat'])assert.equal((await fetch(base+'/api/'+name,{method:'POST',headers:{'X-S03D1-Role':role},body:'{}'})).status,405);
  const r=await fetch(base+'/api/getMasterData',{method:'POST',headers:{'X-S03D1-Role':'Public'},body:'{}'});assert.equal((await r.json()).success,true);
  assert.equal((await fetch(base+'/api/getTamuList',{method:'POST',headers:{'X-S03D1-Role':'Public'},body:'{}'})).status,405);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
