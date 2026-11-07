'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('Admin/Index.html','utf8');
function load(){
  const fields={mobileTamuSort:{value:''},mobileTamuDirection:{value:'asc'}},state={key:null,direction:'asc'},calls=[];
  const c=vm.createContext({tamuTableState:state,allTamuData:[],document:{getElementById:id=>fields[id]||null,querySelectorAll:()=>[]},renderTamuTable:rows=>calls.push(rows)});
  for(const name of ['setMobileTamuSort','updateTamuSortHeadings','sortTamuTable']){
    const start=html.indexOf('    function '+name+'(');assert.ok(start>=0,name+' missing');const end=html.indexOf('\n    function ',start+1);vm.runInContext(html.slice(start,end),c);
  }
  return {c,state,fields,calls};
}
test('phone sort uses existing state, validates choices and renders immediately',()=>{
  const {c,state,calls}=load();c.setMobileTamuSort('instansi','desc');assert.equal(state.key,'instansi');assert.equal(state.direction,'desc');assert.equal(calls.length,1);
  c.setMobileTamuSort('invalid','asc');c.setMobileTamuSort('instansi','invalid');assert.equal(calls.length,1);assert.equal(state.direction,'desc');
  c.setMobileTamuSort('','asc');assert.equal(state.key,null);assert.equal(state.direction,'asc');assert.equal(calls.length,2);
});
test('desktop sort syncs phone selectors and phone can preserve the existing order',()=>{
  const {c,state,fields}=load();c.sortTamuTable('status');c.updateTamuSortHeadings();assert.equal(fields.mobileTamuSort.value,'status');assert.equal(fields.mobileTamuDirection.value,'asc');
  c.sortTamuTable('status');c.updateTamuSortHeadings();assert.equal(fields.mobileTamuDirection.value,'desc');assert.equal(state.key,'status');
});
