'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {startupEnvironment,BASE}=require('./startup.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
test('lightweight summary preserves every consumed field and legacy response across all S02 cohorts',()=>{
  for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
    const before=startupEnvironment({baseline:true,size,profile}),after=startupEnvironment({size,profile});
    const full=before.measure('getDashboardData'),retained=after.measure('getDashboardData'),summary=after.measure('getDashboardSummary');
    assert.equal(JSON.stringify(retained.result),JSON.stringify(full.result));
    const expected=plain(full.result);delete expected.data.loStats;assert.deepEqual(plain(summary.result),expected);
    assert.equal(summary.metrics.rangeReads,4);assert.ok(!summary.metrics.reads.some(r=>r.table==='Master_Pegawai'));
    for(const method of ['getTamuList','getRapatCalendar'])assert.equal(JSON.stringify(before.measure(method).result),JSON.stringify(after.measure(method).result));
  }
});
test('summary never touches the employee sheet and retains empty table behavior',()=>{
  const e=startupEnvironment({size:20});delete e.values.Master_Pegawai;
  for(const name of ['Data_Tamu','Data_Rapat','Kendali_SPPD'])e.values[name]=[];
  const original=e.context.getSpreadsheet;e.context.getSpreadsheet=()=>{const ss=original();return {getSheetByName(name){assert.notEqual(name,'Master_Pegawai');return ss.getSheetByName(name);}};};
  const r=e.measure('getDashboardSummary');assert.equal(r.result.data.stats.totalTamu,0);assert.deepEqual(plain(r.result.data.recentTamu),[]);assert.deepEqual(plain(r.result.data.todayMeetings),[]);
});
test('startup sends all three requests immediately; summary renders independently and stale summary/calendar replies are ignored',async()=>{
  const requests=[],rendered=[],fields={};
  const c=vm.createContext({console:{warn(){},error(){}},Promise,dashboardRequestRevision:0,calendarRequestRevision:0,visitListRevision:0,
    callBackend:(name,args,ok,fail)=>requests.push({name,ok,fail}),document:{getElementById:id=>fields[id]||={}},
    mergeVisitPatches:r=>r,renderTodayMeetings:r=>rendered.push(r),renderRecentTamu(){},renderTamuTable(){},renderMonthlyReport(){},renderMeetingsList:r=>rendered.push(r),renderPanelState(){},renderTableState(){},responseMessage:()=>'',showToast(){}});
  vm.runInContext(fs.readFileSync('Admin/Index.html','utf8').match(/    function loadAllDashboard\([^]*?\n    \}/)[0],c);
  const first=c.loadAllDashboard();assert.deepEqual(requests.map(r=>r.name),['getDashboardSummary','getTamuList','getRapatCalendar']);
  requests[0].ok({success:true,data:{stats:{totalTamu:5},todayMeetings:['fast']}});assert.equal(fields.statTotalTamu.innerText,5);assert.deepEqual(rendered,[['fast']]);
  const second=c.loadAllDashboard();requests[3].ok({success:true,data:{stats:{totalTamu:8},todayMeetings:['new']}});
  requests[0].ok({success:true,data:{stats:{totalTamu:1},todayMeetings:['stale']}});assert.equal(fields.statTotalTamu.innerText,8);
  requests[5].ok({success:true,data:['new calendar']});requests[2].ok({success:true,data:['stale calendar']});assert.ok(!rendered.some(x=>x[0]==='stale calendar'));
  requests[1].fail(new Error('Synthetic failure'));requests[4].ok({success:true,data:[]});
  assert.deepEqual(Array.from(await first),[true,false,true]);assert.deepEqual(Array.from(await second),[true,true,true]);
});
test('desktop/mobile markup and styling are byte-identical to approved S03A',()=>{
  const before=cp.execFileSync('git',['show',BASE+':Admin/Index.html'],{encoding:'utf8'}),after=fs.readFileSync('Admin/Index.html','utf8');
  assert.equal(after.replaceAll('getDashboardSummary','getDashboardData').replace(/\r\n/g,'\n'),before.replace(/\r\n/g,'\n'));
});

test('each startup endpoint can fail independently and summary revisions protect real out-of-order replies',async()=>{
  for(const failed of [0,1,2]){
    const requests=[],fields={},renders=[];
    const c=vm.createContext({console:{warn(){},error(){}},Promise,dashboardRequestRevision:0,calendarRequestRevision:0,visitListRevision:0,
      callBackend:(name,args,ok,fail)=>requests.push({name,ok,fail}),document:{getElementById:id=>fields[id]||={}},
      mergeVisitPatches:r=>r,renderTodayMeetings:r=>renders.push(r),renderRecentTamu(){},renderTamuTable(){},renderMonthlyReport(){},renderMeetingsList(){},renderPanelState(){},renderTableState(){},responseMessage:()=>'',showToast(){}});
    vm.runInContext(fs.readFileSync('Admin/Index.html','utf8').match(/    function loadAllDashboard\([^]*?\n    \}/)[0],c);
    const pending=c.loadAllDashboard();
    requests.forEach((r,i)=>i===failed?r.fail(Error('Synthetic failure')):r.ok({success:true,data:i===0?{stats:{totalTamu:12},todayMeetings:['ok']}:[]}));
    assert.deepEqual(Array.from(await pending),[0,1,2].map(i=>i!==failed));
    if(failed!==0)assert.equal(fields.statTotalTamu.innerText,12);
    // Two still-pending summary reads, completed in reverse order.
    const older=c.loadAllDashboard({visitors:false,calendar:false}),newer=c.loadAllDashboard({visitors:false,calendar:false});
    requests[4].ok({success:true,data:{stats:{totalTamu:22},todayMeetings:['new']}});
    requests[3].ok({success:true,data:{stats:{totalTamu:11},todayMeetings:['old']}});
    await Promise.all([older,newer]);assert.equal(fields.statTotalTamu.innerText,22);assert.ok(!renders.some(r=>r[0]==='old'));
  }
});
