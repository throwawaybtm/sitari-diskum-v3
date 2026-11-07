'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {calendarEnvironment}=require('./calendar.cjs');
const json=value=>JSON.parse(JSON.stringify(value));
const doc=name=>JSON.stringify({name,url:'https://example.invalid/synthetic/'+name});
function equivalent(configure){
  const before=calendarEnvironment({baseline:true,size:20,profile:'representative'}),after=calendarEnvironment({size:20,profile:'representative'});
  for(const e of [before,after])configure(e.values);
  const a=before.measureCalendar(),b=after.measureCalendar();assert.deepEqual(json(b.result),json(a.result));
  assert.equal(b.metrics.payloadBytes,a.metrics.payloadBytes);assert.deepEqual(b.metrics.reads,a.metrics.reads);return {before,after,data:b.result.data};
}
test('missing/empty document tables preserve statuses, photos, manual attendance, cancellation and order',()=>{
  for(const missing of [false,true]){
    const {data}=equivalent(v=>{if(missing)delete v.Dokumen_Agenda;else v.Dokumen_Agenda=[];v.Data_Rapat[1][12]='Dibatalkan';});
    assert.deepEqual(data.map(r=>r.id),[1,...Array.from({length:18},(_,i)=>i+3)]);
    assert.equal(data[0].status,'Terjadwal');assert.equal(data[0].notula,null);assert.equal(data[0].photos.length,1);assert.equal(data[0].manual_attendance,true);
  }
});
test('duplicates preserve the first row, including an empty first document value',()=>{
  const {data}=equivalent(v=>{v.Dokumen_Agenda=[[1,doc('first'),''],['1',doc('second'),''],[2,'',''],['2',doc('later'),'']];});
  assert.equal(data[0].notula.name,'first');assert.equal(data[1].notula,null);assert.equal(data[1].status,'Selesai');
});
test('String identifier equivalence is preserved without trimming, numeric parsing or prototype keys',()=>{
  const ids=[1,'1','01',' 1 ',0,false,'',null,undefined,NaN,Infinity,'__proto__','constructor','toString','invalid-id'];
  const {data}=equivalent(v=>{
    v.Data_Rapat=v.Data_Rapat.slice(0,ids.length).map((r,i)=>{r[0]=ids[i];return r;});
    v.Dokumen_Agenda=ids.map((id,i)=>[id,doc('id-'+i),'']);
  });
  assert.equal(data[0].notula.name,'id-0');assert.equal(data[1].notula.name,'id-0');
  assert.equal(data[2].notula.name,'id-2');assert.equal(data[3].notula.name,'id-3');
  assert.equal(data[11].notula.name,'id-11');assert.equal(data[14].notula.name,'id-14');
});
test('raw null/undefined/non-finite identifiers retain the original String coercion',()=>{
  // Bypass the S02 range mock's blank-cell normalization for adversarial raw values.
  const ids=[null,undefined,NaN,Infinity,false,'null','undefined','NaN','',1,'1','01'];
  const responses=[];
  for(const baseline of [true,false]){
    const e=calendarEnvironment({baseline,size:20});
    const rows=ids.map((id,i)=>{const row=e.values.Data_Rapat[i].slice();row[0]=id;return row;});
    const docs=ids.map((id,i)=>[id,doc('raw-'+i),'']);
    e.context.readMeetingRows_=()=>rows;
    e.context.getSpreadsheet=()=>({getSheetByName:name=>name==='Data_Rapat'?{getLastRow:()=>rows.length+1}:name==='Dokumen_Agenda'?{getLastRow:()=>docs.length+1,getRange:()=>({getValues:()=>docs})}:null});
    responses.push(e.measureCalendar().result);
  }
  assert.deepEqual(json(responses[1]),json(responses[0]));
  assert.equal(responses[1].data[0].notula.name,'raw-0');assert.equal(responses[1].data[5].notula.name,'raw-0');
  assert.equal(responses[1].data[8].notula.name,'raw-8');assert.equal(responses[1].data[10].notula.name,'raw-9');
});
test('malformed JSON remains lazy: unmatched/cancelled/later duplicates ignored, selected first fails',()=>{
  equivalent(v=>{v.Data_Rapat[1][12]='Dibatalkan';v.Dokumen_Agenda=[[1,doc('valid'),''],['1','{bad',''],[2,'{bad',''],['unmatched','{bad','']];});
  for(const baseline of [true,false]){
    const e=calendarEnvironment({baseline,size:20});e.values.Dokumen_Agenda=[[1,'{bad',''],['1',doc('later'),'']];
    assert.throws(()=>e.measureCalendar(),{name:'SyntaxError'});
  }
});
test('each request sees updated document metadata without a persistent cache',()=>{
  const e=calendarEnvironment({size:20});assert.equal(e.measureCalendar().result.data[0].notula.name,'Synthetic document');
  e.values.Dokumen_Agenda[0][1]=doc('changed');assert.equal(e.measureCalendar().result.data[0].notula.name,'changed');
  e.values.Dokumen_Agenda=[];assert.equal(e.measureCalendar().result.data[0].notula,null);
});
test('all S02 cohorts return exactly the original response with bounded request-local document matching',()=>{
  for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
    const before=calendarEnvironment({baseline:true,size,profile,countJoins:true});
    const after=calendarEnvironment({size,profile,countJoins:true,countIndex:true});
    const a=before.measureCalendar(),b=after.measureCalendar();assert.deepEqual(json(b.result),json(a.result));
    if(profile==='dense'&&size===20)assert.equal(a.metrics.documentComparisons,630);
    assert.equal(a.metrics.payloadBytes,b.metrics.payloadBytes);assert.deepEqual(b.metrics.reads,a.metrics.reads);
    assert.ok(a.metrics.documentComparisons>size);assert.equal(b.metrics.documentComparisons,0);
    assert.deepEqual(b.indexOperations,{maps:1,has:after.values.Dokumen_Agenda.length,set:after.values.Dokumen_Agenda.length,get:size});
  }
});
