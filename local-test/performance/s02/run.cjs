'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createEnvironment,ROOT,SOURCES}=require('./synthetic.cjs');
const {createFrontend}=require('./frontend.cjs');
const {summarize}=require('./stats.cjs');
const WARMUPS=5,RUNS=30;
function run() {
  const cases=[];
  for(const profile of ['dense','representative'])for(const size of [20,200,1000]) {
    const setup=performance.now(),env=createEnvironment({size,profile}),setupVmMs=performance.now()-setup;
    const counted=createEnvironment({size,profile,countJoins:true});
    const endpoints={};
    for(const [key,method,payload] of [
      ['dashboard','getDashboardData'],['visits','getTamuList'],['calendar','getRapatCalendar'],
      ['tab0','getVisitWorkflow',{kode_kunjungan:'S02-VISIT-0',tab:0}],
      ['tab3','getVisitWorkflow',{kode_kunjungan:'S02-VISIT-1',tab:3}],
      ['tab5','getVisitWorkflow',{kode_kunjungan:'S02-VISIT-2',tab:5}],
      ['archiveOne','getVisitArchiveDocument',{kode_kunjungan:'S02-VISIT-2',index:0}]
    ]) {
      // Archive needs a completed visit, also in the dense profile.
      if(key==='tab5'||key==='archiveOne')for(const e of [env,counted]){const w=JSON.parse(e.values.Alur_Kunjungan[2][2]);w.status='Selesai';e.values.Alur_Kunjungan[2][2]=JSON.stringify(w);}
      const structure=counted.measure(method,payload),reference=env.measure(method,payload);
      if(JSON.stringify(structure.result)!==JSON.stringify(reference.result))throw Error('Counting changed output: '+key);
      for(let i=0;i<WARMUPS;i++)env.measure(method,payload);
      const samples=Array.from({length:RUNS},()=>env.measure(method,payload).metrics);
      const distributions=Object.fromEntries(['handlerVmMs','mockServiceMs','jsResidualMs','serializationMs','heapDeltaBytes'].map(key=>[key,summarize(samples.map(s=>s[key]))]));
      const {handlerVmMs,mockServiceMs,jsResidualMs,serializationMs,heapDeltaBytes,...operations}=structure.metrics;
      endpoints[key]={operations,distributions};
    }
    const ui=createFrontend(),visits=env.measure('getTamuList').result.data,agendas=env.measure('getRapatCalendar').result.data;
    for(let i=0;i<WARMUPS;i++)ui.measure(visits,agendas);
    const renders=Array.from({length:RUNS},()=>ui.measure(visits,agendas));
    cases.push({profile,size,attendance:size*5,setupVmMs,endpoints,frontend:{...renders[0],visitHtmlMs:summarize(renders.map(r=>r.visitHtmlMs)),agendaHtmlMs:summarize(renders.map(r=>r.agendaHtmlMs)),emptySearchSerializations:ui.emptySearchCount(size)}});
  }
  return {methodology:{warmups:WARMUPS,runs:RUNS,percentiles:'nearest-rank',clock:'performance.now monotonic',counting:'separate VM; joins counted only in structural pass; identical results asserted',serviceTiming:'in-memory range materialization and finder scans, NOT Google Sheets duration',heap:'heap delta includes allocation and GC; not peak memory',order:'fixed cohort/endpoint order, warm VM; no cold GAS claim'},environment:{node:process.version,os:os.type()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,rssAtEndBytes:process.memoryUsage().rss},sourceHashes:Object.fromEntries(SOURCES.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'Admin',f))).digest('hex')])),cases};
}
if(require.main===module){const result=run(),out=path.join(ROOT,'outputs/performance-s02');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'synthetic.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output:'outputs/performance-s02/synthetic.json',cohorts:result.cases.length,samplesPerOperation:RUNS}));}
module.exports={run};
