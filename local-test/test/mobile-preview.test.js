'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('meeting preview opens the real local calendar form only for its selected page',()=>{
  const html=fs.readFileSync('local-test/previews/mobile.html','utf8');
  const handlers={},calls=[];
  const fields={page:{value:'/',addEventListener:(event,fn)=>handlers.page=fn},width:{addEventListener(){}},open:{href:'/'},preview:{style:{},addEventListener:(event,fn)=>handlers.preview=fn,contentWindow:{switchTab:tab=>calls.push(tab),bukaModalRapat:()=>calls.push('open-meeting')}}};
  vm.runInNewContext(html.match(/<script>([^]*?)<\/script>/)[1],{document:{getElementById:id=>fields[id]}});
  assert.equal(typeof handlers.preview,'function','iframe load handler exists');
  handlers.preview();assert.deepEqual(calls,[]);
  fields.page.value='/?preview=meeting';handlers.page({target:fields.page});
  assert.equal(fields.preview.src,'/?preview=meeting');assert.equal(fields.open.href,'/?preview=meeting');
  handlers.preview();assert.deepEqual(calls,['calendar','open-meeting']);
  fields.page.value='/tamu-fo';handlers.preview();assert.equal(calls.length,2);
});
