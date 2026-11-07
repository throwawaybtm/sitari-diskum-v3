'use strict';
const fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {frontend,BASE}=require('./frontend.cjs');
const {createEnvironment}=require('../s02/synthetic.cjs');
const {summarize}=require('../s02/stats.cjs');
function run(){
 const cases=[];
 for(const profile of ['dense','representative'])for(const size of [20,200,1000]){
  const env=createEnvironment({size,profile}),visits=env.measure('getTamuList').result.data,agendas=env.measure('getRapatCalendar').result.data;
  const uis={before:frontend({baseline:true}),after:frontend()},samples={before:[],after:[]};
  function sample(ui){
   const result=ui.measure(visits,agendas),c=ui.context;
   ui.context.document.getElementById('reportMonth').value='2026-11';let start=performance.now();c.renderMonthlyReport();result.monthlyMs=performance.now()-start;
   ui.fields.visitSearch.value='synthetic person, impossible';start=performance.now();c.renderTamuTable(visits);result.searchMs=performance.now()-start;ui.fields.visitSearch.value='';
   start=performance.now();c.filterAgendaRecords_(visits,'','');result.blankSearchMs=performance.now()-start;
   return result;
  }
  for(let i=0;i<5;i++)for(const ui of Object.values(uis))sample(ui);
  for(let i=0;i<30;i++)for(const side of i%2?['after','before']:['before','after'])samples[side].push(sample(uis[side]));
  const structure={};
  for(const side of ['before','after']){
   const ui=uis[side];ui.measure(visits,agendas);let reads=0;
   ui.context.allTamuData=visits.map(v=>({...v,get kode_kunjungan(){reads++;return v.kode_kunjungan;}}));ui.context.renderMeetingsList(agendas);
   structure[side]={visitorIdReads:reads,emptySerializations:ui.emptySearchCount(size),guestRows:samples[side][0].guestRowsRendered,guestHtmlBytes:samples[side][0].guestHtmlBytes,agendaHtmlBytes:samples[side][0].agendaHtmlBytes};
  }
  assert.equal(uis.before.fields.tamuTableBody.innerHTML,uis.after.fields.tamuTableBody.innerHTML);assert.equal(uis.before.fields.meetingsListContainer.innerHTML,uis.after.fields.meetingsListContainer.innerHTML);
  cases.push({profile,size,...Object.fromEntries(['before','after'].map(side=>[side,{...structure[side],timings:Object.fromEntries(['visitHtmlMs','agendaHtmlMs','monthlyMs','searchMs','blankSearchMs'].map(k=>[k,summarize(samples[side].map(s=>s[k]))]))}]))});
 }
 return {baseline:BASE,environment:{node:process.version,os:os.release(),cpu:os.cpus()[0].model},methodology:{runs:30,warmups:5,percentiles:'nearest-rank',scope:'S02 actual frontend functions with DOM stubs; generation only, not layout/paint; alternating pairs'},cases};
}
if(require.main===module){fs.mkdirSync('outputs/performance-s03c',{recursive:true});fs.writeFileSync('outputs/performance-s03c/processing.json',JSON.stringify(run(),null,2));console.log('Saved six paired frontend cohorts.');}
module.exports={run};
