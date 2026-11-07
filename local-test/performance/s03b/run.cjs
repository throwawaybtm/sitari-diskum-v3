'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {startupEnvironment,BASE}=require('./startup.cjs'),{ROOT}=require('../s02/synthetic.cjs'),{summarize}=require('../s02/stats.cjs');
function run(){
  const cases=[];
  for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
    const envs={before:startupEnvironment({baseline:true,size,profile}),after:startupEnvironment({size,profile})},samples={before:[],after:[]},structure={};
    for(const side of ['before','after']){
      const result=envs[side].measureStartup();structure[side]=result.map(r=>({name:r.name,opens:r.metrics.opens,rangeReads:r.metrics.rangeReads,rows:r.metrics.returnedRows,cells:r.metrics.cells,payloadBytes:r.metrics.payloadBytes}));
    }
    const old=envs.before.measure('getDashboardData').result,summary=envs.after.measure('getDashboardSummary').result;delete old.data.loStats;assert.equal(JSON.stringify(old),JSON.stringify(summary));
    for(const name of ['getTamuList','getRapatCalendar'])assert.equal(JSON.stringify(envs.before.measure(name).result),JSON.stringify(envs.after.measure(name).result));
    for(let i=0;i<5;i++){envs.before.measureStartup();envs.after.measureStartup();}
    for(let i=0;i<30;i++)for(const side of i%2?['after','before']:['before','after'])samples[side].push(envs[side].measureStartup());
    const results={};
    for(const side of ['before','after'])results[side]={endpoints:structure[side].map((counts,i)=>({...counts,timings:Object.fromEntries(['handlerVmMs','mockServiceMs','jsResidualMs','serializationMs'].map(k=>[k,summarize(samples[side].map(s=>s[i].metrics[k]))]))})),totals:Object.fromEntries(['opens','rangeReads','rows','cells','payloadBytes'].map(k=>[k,structure[side].reduce((n,r)=>n+r[k],0)])),sumHandlerVmMs:summarize(samples[side].map(s=>s.reduce((n,r)=>n+r.metrics.handlerVmMs,0)))};
    cases.push({profile,size,...results});
  }
  return {baseline:BASE,methodology:{runs:30,warmups:5,clock:'performance.now',percentiles:'nearest-rank',order:'alternate before/after; each triplet executed sequentially for summed server work, NOT parallel browser readiness',services:'synthetic S02 mocks only'},environment:{node:process.version,os:os.type()+' '+os.release(),cpu:os.cpus()[0].model},cases};
}
if(require.main===module){const result=run(),out=path.join(ROOT,'outputs/performance-s03b');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'backend.json'),JSON.stringify(result,null,2));console.log('Saved six startup cohort comparisons.');}
module.exports={run};
