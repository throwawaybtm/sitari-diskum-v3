'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('./stats.cjs');
const {createEnvironment}=require('./synthetic.cjs');
const {renderApp,CSP}=require('./browser-server.cjs');
const {createFrontend}=require('./frontend.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {ROOT}=require('./synthetic.cjs');

test('browser postlude follows the final application script, outside print templates',()=>{
  const html=renderApp(),probe=html.indexOf('<script src="/instrument.js">');
  assert.ok(probe>html.lastIndexOf('</script>',probe-1));
  assert.ok(probe>html.indexOf('function openFormTamuLuarTab'));
  assert.match(html.slice(probe),/^<script src="\/instrument.js"><\/script><\/body>\s*<\/html>\s*$/);
  assert.doesNotMatch(html,/<\?/);assert.match(CSP,/connect-src 'self'/);assert.match(CSP,/form-action 'none'/);
});

test('browser readiness is recorded once and cannot be overwritten by workflow RPCs',async()=>{
  let now=100;
  const c=vm.createContext({performance:{now:()=>now},requestAnimationFrame:fn=>fn(),addEventListener(){},document:{addEventListener(){}},callBackend:(_name,_args,success)=>success({success:true,_s02:{handlerVmMs:1,payloadBytes:1}})});
  c.window=c;vm.runInContext(fs.readFileSync(path.join(__dirname,'instrument.js'),'utf8'),c);
  for(const name of ['getDashboardData','getTamuList','getRapatCalendar'])c.callBackend(name,[],()=>{});
  await Promise.resolve();await Promise.resolve();
  const ready=c.s02.metrics.navigationToAllDataPaint;assert.equal(ready,100);
  now=900;c.callBackend('getVisitWorkflow',[],()=>{});await Promise.resolve();await Promise.resolve();
  assert.equal(c.s02.metrics.navigationToAllDataPaint,ready);
});

test('percentiles use documented nearest-rank rule and reject invalid samples',()=>{
  const s=summarize(Array.from({length:100},(_,i)=>i+1));
  assert.equal(s.p50,50);assert.equal(s.p95,95);assert.equal(s.samples,100);
  assert.throws(()=>summarize([]));assert.throws(()=>summarize([NaN]));
});
test('synthetic endpoints reproduce audit work counts and stable payloads',()=>{
  const env=createEnvironment({size:20,profile:'dense',countJoins:true});
  const counts=[];for(const method of ['getDashboardData','getTamuList','getRapatCalendar']){const r=env.measure(method);assert.equal(r.result.success,true);counts.push(r.metrics.rangeReads);}
  assert.deepEqual(counts,[5,1,5]);assert.equal(env.measure('getRapatCalendar').metrics.documentComparisons,0);
  const plain=createEnvironment({size:20,profile:'dense',countJoins:false});
  assert.deepEqual(JSON.parse(JSON.stringify(env.measure('getRapatCalendar').result)),JSON.parse(JSON.stringify(plain.measure('getRapatCalendar').result)));
});
test('lazy tabs stay targeted, and attendance remains agenda-scoped',()=>{
  const env=createEnvironment({size:200,profile:'representative'});
  const first=env.measure('getVisitWorkflow',{kode_kunjungan:'S02-VISIT-0',tab:0});assert.equal(first.metrics.rangeReads,2);assert.equal(first.metrics.returnedRows,2);
  const attendance=env.measure('getVisitWorkflow',{kode_kunjungan:'S02-VISIT-1',tab:3});assert.equal(attendance.metrics.attendanceRowsFetched,1000);assert.equal(attendance.result.data.attendance.length,5);
});
test('service writes, notifications, arbitrary RPCs and non-synthetic IDs fail closed',()=>{
  const env=createEnvironment({size:20});
  assert.throws(()=>env.measure('saveVisitWorkflow',{}),/not allowed/);
  assert.throws(()=>env.services.SpreadsheetApp.create('test'),/blocked/);
  assert.throws(()=>env.services.DriveApp.createFile('test'),/blocked/);
  assert.throws(()=>env.services.UrlFetchApp.fetch('https://example.invalid'),/blocked/);
  assert.throws(()=>env.services.PropertiesService.getScriptProperties().setProperty('x','y'),/blocked/);
  assert.throws(()=>env.services.SpreadsheetApp.openById('unapproved'),/blocked/);
});
test('fixtures are deterministic and contain no private directory dependency',()=>{
  const a=createEnvironment({size:20}),b=createEnvironment({size:20});
  assert.deepEqual(JSON.parse(JSON.stringify(a.measure('getTamuList').result)),JSON.parse(JSON.stringify(b.measure('getTamuList').result)));
  assert.throws(()=>createEnvironment({size:-1}));assert.throws(()=>createEnvironment({size:20,profile:'unknown'}));
});

test('read probes preserve public delegation and document/attendance work counts',()=>{
  const calls=[],pub=vm.createContext({SiTariCore:new Proxy({},{get:(_,name)=>()=>{calls.push(String(name));return {};}})});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'Public/Code.js'),'utf8'),pub);
  pub.getRapatCalendar();pub.getMasterData();
  assert.deepEqual(calls,['getPublicAttendanceCalendar','getPublicAttendanceMasterData']);
  const env=createEnvironment({size:20});
  const archive=env.measure('getVisitArchiveDocument',{kode_kunjungan:'S02-VISIT-2',index:0});
  assert.equal(archive.metrics.driveFileReads,1);assert.equal(archive.metrics.opens,2);assert.equal(archive.metrics.rangeReads,5);
  assert.equal(archive.metrics.attendanceRowsFetched,100);
  const ui=createFrontend(),render=ui.measure(env.measure('getTamuList').result.data,env.measure('getRapatCalendar').result.data);
  assert.equal(render.guestRowsRendered,20);assert.equal(ui.emptySearchCount(20),20);
});

test('browser server denies writes and external hosts, and returns synthetic reads only',async()=>{
  const server=require('./browser-server.cjs').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const denied=await new Promise((resolve,reject)=>require('node:http').get(base+'/app',{headers:{host:'unapproved.invalid'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(denied,403);
    const headers={'Content-Type':'application/json'};
    assert.equal((await fetch(base+'/api/saveVisitWorkflow',{method:'POST',headers,body:'{}'})).status,405);
    const response=await fetch(base+'/api/getDashboardData',{method:'POST',headers,body:'{}'}),data=await response.json();
    assert.equal(data.success,true);assert.equal(data._s02.rangeReads,5);assert.equal(data.data.stats.totalTamu,200);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
