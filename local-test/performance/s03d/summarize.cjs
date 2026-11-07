'use strict';
const fs=require('node:fs');
const {summarize}=require('../s02/stats.cjs');
const SCENARIOS=['dashboard','calendar','guests','modal','tab','attendance','preview'];
const METRICS=['browserMs','handlerMs','sheetOpenMs','sheetReadMs','transformMs','serializationMs','driveMs','previewLoadMs','rpcCount','errors','bytes'];
function aggregate(samples){
 if(!Array.isArray(samples)||!samples.length||samples.length>10000)throw Error('S03D samples required');
 const groups=new Map();
 for(const r of samples){
  if(!r||Object.keys(r).some(k=>!['scenario','device','phase','ok','metrics'].includes(k))||!SCENARIOS.includes(r.scenario)||!['desktop','android','ios'].includes(r.device)||!['first-observed','repeated'].includes(r.phase)||typeof r.ok!=='boolean'||!r.metrics||Object.keys(r.metrics).some(k=>!METRICS.includes(k))||Object.values(r.metrics).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('S03D numeric schema rejected');
  const key=[r.scenario,r.device,r.phase].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
 }
 return [...groups].map(([group,rows])=>({group,samples:rows.length,failures:rows.filter(r=>!r.ok).length,belowThirtyRepeated:group.endsWith('/repeated')&&rows.filter(r=>r.ok).length<30,metrics:Object.fromEntries(METRICS.flatMap(k=>{
  // Failed/timeout durations stay in raw data and failure counts; never fabricate completion values.
  const values=rows.filter(r=>r.ok&&Object.prototype.hasOwnProperty.call(r.metrics,k)).map(r=>r.metrics[k]);return values.length?[[k,summarize(values)]]:[];
 }))}));
}
if(require.main===module){try{const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(aggregate(rows),null,2));}catch{console.error('S03D numeric samples invalid or missing; no results generated.');process.exitCode=1;}}
module.exports={aggregate};
