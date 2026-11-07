'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');

test('paired browser serves pinned search baseline, isolated postlude, complete summary and blocks writes',async()=>{
 const {server}=require('./browser-server.cjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const side of ['before','after']){
   const html=await (await fetch(base+'/app?variant='+side)).text();
   const start=html.lastIndexOf('<script>'),end=html.lastIndexOf('</script>');
   assert.ok(start>html.indexOf('<script src="/instrument.js">'));assert.ok(end<html.lastIndexOf('</body>'));
   new vm.Script(html.slice(start+8,end));
   const search=html.match(/function filterAgendaRecords_\([^]*?\n\}/)[0],context=vm.createContext({});vm.runInContext(search,context);
   let serialized=0;const rows=[{nested:{toJSON(){serialized++;return 'needle';}}}];
   assert.equal(context.filterAgendaRecords_(rows,'','').length,1);assert.equal(serialized,side==='before'?1:0);
   assert.equal(context.filterAgendaRecords_(rows,'needle','').length,1);
  }
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  assert.equal((await fetch(base+'/api/saveVisitWorkflow',options)).status,405);
  const data=await (await fetch(base+'/api/getDashboardSummary',options)).json();assert.equal(data.data.stats.totalTamu,200);assert.equal(data._s02.rangeReads,4);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('S03B replay serves historical endpoint callers, original blank search and excludes S03C render changes',async()=>{
 const {server}=require('./s03b-replay.cjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const side of ['before','after']){
   const html=await (await fetch(base+'/app?variant='+side)).text();
   assert.ok(html.includes("request('"+(side==='before'?'getDashboardData':'getDashboardSummary')+"', []"));
   assert.ok(!html.includes('const visitsByCode=new Map()'));
   const search=html.match(/function filterAgendaRecords_\([^]*?\n\}/)[0],c=vm.createContext({});vm.runInContext(search,c);let reads=0;
   c.filterAgendaRecords_([{nested:{toJSON(){reads++;return {};}}}],'','');assert.equal(reads,1);
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
