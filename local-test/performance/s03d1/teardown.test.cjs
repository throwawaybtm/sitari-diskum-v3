'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {installS03DBrowserProbe}=require('../s03d/browser-probe.js');
test('stop cancels queued frames and ignores pending RPC/error/observer telemetry but preserves app callbacks',()=>{
 let time=0,next=0,calls=0;const frames=new Map(),pending=[],observers=[],listeners={};
 const w={performance:{now:()=>time++},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
  addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name],
  PerformanceObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}},callBackend:(name,args,ok,fail)=>pending.push({ok,fail})};
 const original=w.callBackend,p=installS03DBrowserProbe(w,true),captured=w.callBackend;
 w.callBackend('getDashboardSummary',[],()=>calls++);pending[0].ok({success:true});
 w.callBackend('getTamuList',[],()=>calls++);w.callBackend('getRapatCalendar',[],null,()=>calls++);
 const finish=p.begin('modal.shell');finish();assert.ok(frames.size>0);const queued=[...frames.values()],error=listeners.error;
 p.stop();assert.equal(w.callBackend,original);assert.equal(frames.size,0);const before=JSON.stringify(p.snapshot());
 pending[1].ok({success:true});pending[2].fail(new Error('SECRET'));queued.forEach(fn=>fn());error();observers.forEach(o=>o.fn({getEntries:()=>[{duration:3}]}));
 finish();p.span('render.visitors',()=>42);captured('getMasterData',[],()=>{});p.stop();
 assert.equal(JSON.stringify(p.snapshot()),before);assert.equal(calls,3);assert.equal(pending.length,3);
});
test('stop inside a success callback freezes its entry and cancels second-stage frames',()=>{
 let next=0,time=0,done;const frames=new Map();
 const original=(name,args,ok)=>done=ok;
 const w={performance:{now:()=>time++},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},removeEventListener(){},callBackend:original};
 const p=installS03DBrowserProbe(w,true);p.begin('tab.ready')();const first=frames.entries().next().value;frames.delete(first[0]);first[1]();assert.equal(frames.size,1);
 let frozen;w.callBackend('getMasterData',[],()=>{p.stop();frozen=JSON.stringify(p.snapshot());});done({success:true});
 assert.equal(frames.size,0);assert.equal(JSON.stringify(p.snapshot()),frozen);assert.equal(w.callBackend,original);
});
