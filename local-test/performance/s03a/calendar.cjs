'use strict';
const cp=require('node:child_process'),vm=require('node:vm');
const {createEnvironment,ROOT}=require('../s02/synthetic.cjs');
const BASE='bd04db7a63ebb531b042c42731c27b8dd6a1b434';
let original;
function originalCalendar(){
  if(!original){
    const source=cp.execFileSync('git',['show',BASE+':Admin/Code.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:1024*1024});
    const start=source.indexOf('function getRapatCalendar() {'),end=source.indexOf('\nfunction createRapatSchedule(',start);
    if(start<0||end<0)throw Error('Baseline calendar source boundary missing');
    original=source.slice(start,end);
  }
  return original;
}
function calendarEnvironment({baseline=false,countIndex=false,...options}={}){
  const env=createEnvironment(options);
  if(baseline)vm.runInContext(originalCalendar(),env.context,{filename:'S02-original-calendar.js'});
  const counts={maps:0,has:0,set:0,get:0};
  if(countIndex)env.context.Map=class extends Map {
    constructor(...args){super(...args);counts.maps++;}
    has(key){counts.has++;return super.has(key);}
    set(key,value){counts.set++;return super.set(key,value);}
    get(key){counts.get++;return super.get(key);}
  };
  return {...env,measureCalendar(){
    for(const key of Object.keys(counts))counts[key]=0;
    const measured=env.measure('getRapatCalendar');return {...measured,indexOperations:{...counts}};
  }};
}
module.exports={BASE,originalCalendar,calendarEnvironment};
