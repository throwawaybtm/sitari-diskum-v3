'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=()=>({mode:'synthetic-staging',sourceCommit:'d1d02475acba50439835c8fcc5b163828897e9ea',adminProjectId:'test-admin',publicProjectId:'test-public',publicLibraryId:'test-admin',publicLibraryVersion:'1',spreadsheetId:'test-db',folderId:'test-folder',documentIds:['test-pdf'],claims:{dedicatedAccountNoProductionAccess:true,syntheticOnly:true,noProductionCredentials:true,privateTestResources:true,readOnlyScopes:true,entryGuardsRemovedInStagingOnly:true,rpcAllowlistReviewed:true}});
test('empty template fails closed, declarations never confer cloud verification or deployment approval',()=>{
 const {verify}=require('./preflight.cjs');assert.throws(()=>verify(JSON.parse(fs.readFileSync(__dirname+'/isolation.example.json'))),/S03D/);
 const r=verify(fixture());assert.deepEqual(r,{localDeclarationValid:true,cloudIsolationVerified:false,deploymentApproved:false});
});
test('preflight rejects mixed projects, floating libraries, secrets, missing claims and production overlaps',()=>{
 const {verify}=require('./preflight.cjs');for(const mutate of [c=>c.publicProjectId=c.adminProjectId,c=>c.publicLibraryId='other',c=>c.publicLibraryVersion='latest',c=>c.token='do-not-print',c=>c.claims.syntheticOnly=false,c=>c.documentIds.push(c.spreadsheetId)]){const c=fixture();mutate(c);assert.throws(()=>verify(c),/S03D/);}
 assert.throws(()=>verify(fixture(),['test-db']),/S03D/);
});
test('read capabilities block unlisted resources, mutation, discovery and raw handle escape',()=>{
 const {createReadProbe}=require('./read-probe.js');let calls=0;
 const range={getValues:()=>[[1]],getDisplayValues:()=>[['1']]};
 const sheet={getLastRow:()=>2,getLastColumn:()=>1,getRange:()=>range};
 const services={SpreadsheetApp:{openById:()=>{calls++;return {getId:()=> 'test-db',getSheetByName:()=>sheet,getSpreadsheetTimeZone:()=> 'Asia/Jakarta'};}},DriveApp:{getFileById:()=>{calls++;return {getName:()=> 'Synthetic PDF',getMimeType:()=> 'application/pdf',getBlob:()=>({getBytes:()=>[37,80,68,70],getContentType:()=> 'application/pdf'})};}}};
 const p=createReadProbe({spreadsheetId:'test-db',documentIds:['test-pdf']},services);
 assert.throws(()=>p.services.SpreadsheetApp.openById('production-sensitive-id'),/S03D/);assert.equal(calls,0);
 const ss=p.getSpreadsheet();assert.equal(calls,1);const s=ss.getSheetByName('Data_Tamu');assert.deepEqual(s.getRange(2,1,1,1).getValues(),[[1]]);
 for(const action of [()=>ss.insertSheet('x'),()=>ss.copy('x'),()=>s.appendRow([1]),()=>s.getRange(2,1,1,1).setValue(9),()=>ss.getSheetByName('Other'),()=>p.services.SpreadsheetApp.getActiveSpreadsheet(),()=>p.services.DriveApp.getFilesByName('x'),()=>p.services.DriveApp.getFileById('other'),()=>p.services.PropertiesService,()=>p.services.UrlFetchApp])assert.throws(action,/S03D/);
 assert.equal(p.services.DriveApp.getFileById('test-pdf').getBlob().getBytes().length,4);
 assert.throws(()=>p.services.DriveApp.getFileById('test-pdf').setSharing(),/S03D/);
 assert.equal(calls,3);
});
test('timings contain only fixed labels and numeric counts, sanitize failures and count serialization separately',()=>{
 const {createReadProbe}=require('./read-probe.js');let time=0;
 const p=createReadProbe({spreadsheetId:'test-db',documentIds:[]},{},{clock:()=>time++});
 const out=p.run('getTamuList',()=>{p.span('transform',()=>[1]);return {success:true,data:[{nama:'must-not-enter-metrics',url:'https://private.invalid'}]};});
 assert.equal(out.value.data.length,1);assert.equal(out.metrics.handlerMs,3);assert.equal(out.metrics.serializationMs,1);assert.ok(out.metrics.payloadBytes>0);
 assert.doesNotMatch(JSON.stringify(out.metrics),/must-not|https|test-db/);
 assert.throws(()=>p.run('saveVisitWorkflow',()=>assert.fail()),/S03D/);
 assert.throws(()=>p.span('visitor-secret',()=>assert.fail()),/S03D/);
 const failed=createReadProbe({spreadsheetId:'test-db',documentIds:[]},{},{clock:()=>time++});
 const error=failed.run('getTamuList',()=>{throw Error('secret token and record');});assert.equal(error.value.success,false);assert.doesNotMatch(JSON.stringify(error),/secret token/);assert.equal(error.metrics.errors,1);
});
module.exports={fixture};

test('capability wrappers preserve actual S03C backend responses on S02 fixtures without running initialization',()=>{
 const {createEnvironment}=require('../s02/synthetic.cjs'),{createReadProbe}=require('./read-probe.js');
 for(const method of ['getDashboardSummary','getTamuList','getRapatCalendar','getVisitWorkflow','getVisitArchiveDocument']){
  const before=createEnvironment({size:20}),after=createEnvironment({size:20});
  const payload=method==='getVisitWorkflow'?{kode_kunjungan:'S02-VISIT-2',tab:3}:method==='getVisitArchiveDocument'?{kode_kunjungan:'S02-VISIT-2',index:0}:undefined;
  const expected=before.measure(method,payload).result;
  const p=createReadProbe({spreadsheetId:'s02-synthetic-db',documentIds:['s02-synthetic-document']},after.services);
  after.context.getSpreadsheet=p.getSpreadsheet;after.context.SpreadsheetApp=p.services.SpreadsheetApp;after.context.DriveApp=p.services.DriveApp;
  const actual=p.run(method,()=>after.measure(method,payload).result);
  assert.equal(actual.value.success,true);assert.equal(JSON.stringify(actual.value),JSON.stringify(expected));assert.equal(actual.metrics.errors,0);assert.ok(actual.metrics.events.some(e=>e.label==='sheet.open'));
 }
});
