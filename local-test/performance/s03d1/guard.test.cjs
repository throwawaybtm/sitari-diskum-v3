'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {localConfig}=require('./assemble.cjs');
test('rendered transport denies writes, production navigation and outbound fetch before dispatch; retains read handler chaining',async()=>{
 const cfg=localConfig(),requests=[],opens=[],handlers={},metas=[];
 const window={fetch:async(url,opts)=>{requests.push({url,opts});return {json:async()=>({success:true,data:[]})};},open:(...a)=>opens.push(a)};
 const document={addEventListener:(name,fn)=>handlers[name]=fn,createElement:()=>({}),head:{appendChild:meta=>metas.push(meta)}};
 const script=fs.readFileSync(__dirname+'/guard.html','utf8').match(/<script[^>]*>([^]*?)<\/script>/)[1].replace('S03D1_CONFIG_JSON',JSON.stringify({role:'Public',reads:['getMasterData'],local:true,adminUrl:cfg.adminUrl,publicUrl:cfg.publicUrl,documentIds:cfg.documentIds}));
 vm.runInNewContext(script,{window,document,location:{href:cfg.publicUrl,origin:'http://127.0.0.1:4176'},URL,Promise,Set,Proxy,Error});
 let blocked=false;window.__s03dBridge.withFailureHandler(()=>blocked=true).saveVisitWorkflow({action:'finish'});assert.equal(blocked,true);assert.equal(requests.length,0);
 const r=await new Promise((resolve,reject)=>window.__s03dBridge.withSuccessHandler(resolve).withFailureHandler(reject).getMasterData());assert.equal(r.success,true);assert.equal(requests.length,1);assert.equal(requests[0].opts.headers['X-S03D1-Role'],'Public');
 await assert.rejects(()=>window.fetch('https://script.google.com/macros/s/PRODUCTION/exec'));assert.throws(()=>window.open('https://drive.google.com/file/d/production/view'));
 window.open(cfg.adminUrl);assert.equal(opens.length,1);let cancelled=false;handlers.click({target:{closest:()=>({href:'https://script.google.com/macros/s/PRODUCTION/exec'})},preventDefault:()=>cancelled=true});assert.equal(cancelled,true);
 assert.match(metas[0].content,/default-src 'none'/);assert.doesNotMatch(metas[0].content,/https:/);
});
