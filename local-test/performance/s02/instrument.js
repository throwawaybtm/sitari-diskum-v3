/* Test-only postlude: original application files and UI are unchanged. */
'use strict';
window.s02={rpc:[],render:[],longTasks:[],failures:0,metrics:{}};
const probe=window.s02,paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
try{new PerformanceObserver(list=>list.getEntries().forEach(e=>probe.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});}catch{}
addEventListener('error',()=>probe.failures++);
document.addEventListener('DOMContentLoaded',()=>{probe.metrics.domContentLoaded=performance.now();},{once:true});
const originalBackend=callBackend;
callBackend=function(name,args,success,failure){
  const start=performance.now();
  return originalBackend(name,args,result=>{
    const end=performance.now(),callbackStart=end;
    try{success(result);}catch(error){probe.failures++;throw error;}
    const item={name,duration:end-start,handlerVmMs:result._s02?.handlerVmMs||0,callbackMs:performance.now()-callbackStart,bytes:result._s02?.payloadBytes||0};probe.rpc.push(item);
    const summaryNames=['getDashboardData','getDashboardSummary'],isSummary=summaryNames.includes(name);
    if(isSummary&&!probe.summaryScheduled){probe.summaryScheduled=true;paint().then(()=>probe.metrics.navigationToSummaryPaint=performance.now());}
    const startup=['getTamuList','getRapatCalendar'];
    if((isSummary||startup.includes(name))&&!probe.allDataScheduled&&probe.rpc.some(r=>summaryNames.includes(r.name))&&startup.every(n=>probe.rpc.some(r=>r.name===n))){
      probe.allDataScheduled=true;paint().then(()=>probe.metrics.navigationToAllDataPaint=performance.now());
    }
  },error=>{probe.failures++;if(failure)failure(error);});
};
for(const name of ['renderTodayMeetings','renderRecentTamu','renderTamuTable','renderMeetingsList','renderMonthlyReport','renderVisitWorkflow']){
  const original=window[name];if(typeof original!=='function')continue;
  window[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{probe.render.push({name,duration:performance.now()-start});}};
}
probe.wait=async condition=>{const start=performance.now();while(!condition()){if(performance.now()-start>20000)throw Error('Probe timeout');await new Promise(r=>setTimeout(r,20));}};
probe.exercise=async()=>{
  if(document.visibilityState!=='visible')throw Error('Hidden document timing rejected');
  await probe.wait(()=>probe.metrics.navigationToAllDataPaint);
  switchTab('tamu');await paint();
  const start=performance.now(),open=openVisitWorkflow('S02-VISIT-2');
  if(document.getElementById('visitWorkflowModal').hidden)throw Error('Shell did not open');
  probe.metrics.modalShellMs=performance.now()-start;
  await open;if(!visitModalData)throw Error('Authoritative workflow absent');await paint();
  probe.metrics.modalAuthoritativePaintMs=performance.now()-start;
  let t=performance.now();await selectVisitTab(0);await paint();probe.metrics.unloadedTabPaintMs=performance.now()-t;
  t=performance.now();await selectVisitTab(3);await paint();probe.metrics.attendanceTabPaintMs=performance.now()-t;
  const before=probe.rpc.length;t=performance.now();await selectVisitTab(0);await paint();probe.metrics.cachedTabPaintMs=performance.now()-t;
  if(probe.rpc.length!==before)throw Error('Cached tab unexpectedly fetched');
  closeVisitWorkflow();
  const resources=performance.getEntriesByType('resource').filter(r=>/^https:/.test(r.name)).map(r=>({category:new URL(r.name).hostname,duration:r.duration,bytes:r.transferSize}));
  return {metrics:probe.metrics,rpc:probe.rpc,render:probe.render,resources,longTaskCount:probe.longTasks.length,longTaskMs:probe.longTasks.reduce((a,b)=>a+b,0),failures:probe.failures,visibility:document.visibilityState};
};
