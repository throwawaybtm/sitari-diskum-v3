'use strict';
// Explicitly installed in an approved synthetic staging page only. Never auto-runs.
function installS03DBrowserProbe(w,approved) {
  if(approved!==true||!w||typeof w.callBackend!=='function')throw Error('S03D staging approval required');
  const endpoints=new Set(['getDashboardSummary','getTamuList','getRapatCalendar','getVisitWorkflow','getAgendaAttendance','getVisitArchiveDocument','getMeetingRoomOptions','getMasterData','getVisitAttendanceRoster']);
  const labels=new Set(['dashboard.usable','modal.shell','modal.authoritative','tab.ready','attendance.ready','preview.load','preview.visible','render.visitors','render.agendas','render.monthly','render.workflow']);
  const data={rpc:[],marks:[],longTasks:[],resources:[],errors:0},original=w.callBackend,clock=()=>w.performance.now();
  let active=true;const frames=new Set();
  const schedule=fn=>{if(!active)return;let id;id=w.requestAnimationFrame(()=>{frames.delete(id);if(active)fn();});frames.add(id);};
  const frame=fn=>schedule(()=>schedule(fn));
  let sequence=0,summary=false,all=false;const received=new Set();
  const mark=(label,start)=>{if(!active)return;if(!labels.has(label)||!Number.isFinite(start))throw Error('S03D metric rejected');data.marks.push({label,durationMs:Math.max(0,clock()-start)});};
  const wrapper=function(name,args,success,failure){
    if(!active)return;
    if(!endpoints.has(name)){if(failure)failure(Error('S03D read-only RPC'));return;}
    const start=clock(),sample=++sequence;
    return original(name,args,result=>{
      if(!active){if(success)success(result);return;}
      const entry={method:name,sample,durationMs:Math.max(0,clock()-start),ok:Boolean(result&&result.success)};
      data.rpc.push(entry);const callbackStart=clock();
      try{if(success)success(result);}finally{if(active)entry.callbackMs=Math.max(0,clock()-callbackStart);}
      if(!active)return;
      if(entry.ok){received.add(name);if(name==='getDashboardSummary'&&!summary){summary=true;frame(()=>mark('dashboard.usable',0));}
        if(!all&&['getDashboardSummary','getTamuList','getRapatCalendar'].every(n=>received.has(n))){all=true;frame(()=>data.allDataReadyMs=clock());}}
    },()=>{if(active){data.errors++;data.rpc.push({method:name,sample,durationMs:Math.max(0,clock()-start),ok:false,callbackMs:0});}if(failure)failure(Error('S03D read failed'));});
  };
  w.callBackend=wrapper;
  const observers=[];
  if(w.PerformanceObserver)for(const type of ['longtask','resource']){
    try{const observer=new w.PerformanceObserver(list=>{if(!active)return;list.getEntries().forEach(e=>{
      if(type==='longtask')data.longTasks.push({durationMs:e.duration});
      else data.resources.push({kind:['script','css','img','link'].includes(e.initiatorType)?e.initiatorType:'other',durationMs:e.duration,bytes:e.transferSize||0,attributionAvailable:Boolean(e.duration||e.transferSize)});
    });});observer.observe({type,buffered:true});observers.push(observer);}catch{}
  }
  const onError=()=>{if(active)data.errors++;};w.addEventListener('error',onError);
  return Object.freeze({span:(label,fn)=>{if(!labels.has(label))throw Error('S03D metric rejected');const start=clock();try{return fn();}finally{mark(label,start);}},begin:label=>{if(!labels.has(label))throw Error('S03D metric rejected');const start=clock();return ()=>frame(()=>mark(label,start));},
    snapshot:()=>JSON.parse(JSON.stringify(data)),stop:()=>{if(!active)return;active=false;if(w.callBackend===wrapper)w.callBackend=original;for(const id of frames)w.cancelAnimationFrame?.(id);frames.clear();observers.forEach(o=>o.disconnect());w.removeEventListener('error',onError);}});
}
if(typeof module!=='undefined')module.exports={installS03DBrowserProbe};
