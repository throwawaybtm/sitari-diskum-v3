'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const requests=[],toasts=[],fields={};
 const context=vm.createContext({console,Promise,allTamuData:[],allRapatData:[],dashboardRequestRevision:0,calendarRequestRevision:0,visitListRevision:0,
  document:{getElementById:id=>fields[id]||={disabled:false,classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){}}},
  callBackend:(name,args,success,failure)=>requests.push({name,success,failure}),showToast:(...args)=>toasts.push(args),
  mergeVisitPatches:rows=>rows,renderTodayMeetings(){},renderRecentTamu(){},renderTamuTable(){},renderMonthlyReport(){},renderMeetingsList(){},renderPanelState(){},renderTableState(){},responseMessage:()=>''});
 const source=fs.readFileSync('Admin/Index.html','utf8');
 for(const [name,prefix]of [['loadAllDashboard',''],['refreshHeaderData','async ']])vm.runInContext(source.match(new RegExp('    '+prefix+'function '+name+'\\([^]*?\\n    \\}'))[0],context);
 return {context,requests,toasts,fields};
}
test('header refresh waits for all three data loads and suppresses repeated clicks',async()=>{
 const {context:c,requests,toasts,fields}=setup();c.document.getElementById('headerRefreshData');
 const pending=c.refreshHeaderData();assert.equal(fields.headerRefreshData.disabled,true);await c.refreshHeaderData();
 assert.deepEqual(requests.map(r=>r.name),['getDashboardSummary','getTamuList','getRapatCalendar']);
 requests[0].success({success:true,data:{stats:{}}});requests[1].success({success:true,data:[]});await Promise.resolve();assert.equal(fields.headerRefreshData.disabled,true);
 requests[2].success({success:true,data:[]});assert.equal(await pending,true);assert.equal(fields.headerRefreshData.disabled,false);assert.equal(toasts.at(-1)[0],'success');
});
test('header refresh reports partial failure and releases the button',async()=>{
 const {context:c,requests,toasts,fields}=setup();const pending=c.refreshHeaderData();
 requests[0].success({success:true,data:{stats:{}}});requests[1].success({success:false,error:'Unavailable'});requests[2].success({success:true,data:[]});
 assert.equal(await pending,false);assert.equal(fields.headerRefreshData.disabled,false);assert.equal(toasts.at(-1)[0],'error');
});
