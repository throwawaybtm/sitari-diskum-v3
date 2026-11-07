'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {aggregate}=require('./summarize.cjs');
test('numeric aggregation keeps first observed separate, reports errors/missing coverage and rejects private fields',()=>{
 const samples=Array.from({length:30},(_,i)=>({scenario:'modal',device:'desktop',phase:'repeated',ok:true,metrics:{browserMs:i+1}}));
 samples.push({scenario:'modal',device:'desktop',phase:'first-observed',ok:true,metrics:{browserMs:999}});samples.push({scenario:'modal',device:'desktop',phase:'repeated',ok:false,metrics:{errors:1}});
 const groups=aggregate(samples);assert.equal(groups[0].metrics.browserMs.p50,15);assert.equal(groups[0].metrics.browserMs.p95,29);assert.equal(groups[0].failures,1);assert.equal(groups[0].samples,31);assert.equal(groups[0].metrics.handlerMs,undefined);assert.equal(groups[0].belowThirtyRepeated,false);assert.equal(groups[1].metrics.browserMs.p50,999);
 assert.throws(()=>aggregate([]));for(const patch of [{name:'PRIVATE'},{metrics:{url:'secret'}},{metrics:{browserMs:NaN}},{scenario:'SECRET RECORD'}])assert.throws(()=>aggregate([{...samples[0],...patch}]),/S03D/);
});
