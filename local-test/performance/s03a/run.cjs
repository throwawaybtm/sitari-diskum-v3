'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {calendarEnvironment,BASE}=require('./calendar.cjs');
const {ROOT}=require('../s02/synthetic.cjs');
const {summarize}=require('../s02/stats.cjs');
const TIMES=['handlerVmMs','mockServiceMs','jsResidualMs','serializationMs','heapDeltaBytes'];
function run(){
  const cases=[];
  for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
    const before=calendarEnvironment({baseline:true,size,profile}),after=calendarEnvironment({size,profile});
    const beforeCounted=calendarEnvironment({baseline:true,size,profile,countJoins:true}),afterCounted=calendarEnvironment({size,profile,countJoins:true,countIndex:true});
    const a=beforeCounted.measureCalendar(),b=afterCounted.measureCalendar();
    assert.equal(JSON.stringify(a.result),JSON.stringify(b.result));assert.deepEqual(a.metrics.reads,b.metrics.reads);assert.equal(a.metrics.payloadBytes,b.metrics.payloadBytes);
    assert.equal(b.metrics.documentComparisons,0);assert.deepEqual(b.indexOperations,{maps:1,has:after.values.Dokumen_Agenda.length,set:after.values.Dokumen_Agenda.length,get:size});
    for(let i=0;i<5;i++){before.measureCalendar();after.measureCalendar();}
    const samples={before:[],after:[]};
    // Alternate pair order to limit consistent warmup/scheduling advantage.
    for(let i=0;i<30;i++)for(const key of i%2?['after','before']:['before','after']){
      const result=(key==='before'?before:after).measureCalendar();
      assert.equal(JSON.stringify(result.result),JSON.stringify(a.result));samples[key].push(result.metrics);
    }
    const summary=(measured,key)=>({payloadBytes:measured.metrics.payloadBytes,opens:measured.metrics.opens,rangeReads:measured.metrics.rangeReads,rows:measured.metrics.returnedRows,cells:measured.metrics.cells,documentComparisons:measured.metrics.documentComparisons,indexOperations:measured.indexOperations,distributions:Object.fromEntries(TIMES.map(t=>[t,summarize(samples[key].map(m=>m[t]))]))});
    cases.push({profile,size,documentRows:after.values.Dokumen_Agenda.length,before:summary(a,'before'),after:summary(b,'after')});
  }
  return {baseline:BASE,candidateCodeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'Admin/Code.js'))).digest('hex'),methodology:{runs:30,warmups:5,percentiles:'nearest rank',timing:'S02 measure() reused unchanged; counted runs separate; paired order alternates; handler excludes stringify',limitations:'Local warm Node VM with mock Sheets; no browser/cloud/end-to-end speed claim; heap delta is not peak memory'},environment:{node:process.version,os:os.type()+' '+os.release(),cpu:os.cpus()[0].model,rssAtEndBytes:process.memoryUsage().rss},cases};
}
if(require.main===module){const data=run(),folder=path.join(ROOT,'outputs/performance-s03a');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'comparison.json'),JSON.stringify(data,null,2));console.log('Saved six paired cohorts to outputs/performance-s03a/comparison.json');}
module.exports={run};
