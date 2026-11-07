'use strict';
const cp=require('node:child_process'),vm=require('node:vm');
const {createEnvironment,ROOT}=require('../s02/synthetic.cjs');
const BASE='4e6eacaa73fb03d2f5c6cfd422f16c9e161ade7a';
const baselineCode=()=>cp.execFileSync('git',['show',BASE+':Admin/Code.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:1024*1024});
function startupEnvironment({baseline=false,...options}={}){
  const env=createEnvironment(options);
  if(baseline){const source=baselineCode(),start=source.indexOf('function getDashboardData() {'),end=source.indexOf('\nfunction getMasterData()',start);if(start<0||end<0)throw Error('Baseline function boundary changed');vm.runInContext(source.slice(start,end),env.context);}
  const summaryMethod=baseline?'getDashboardData':'getDashboardSummary';
  return {...env,summaryMethod,measureStartup(){return [summaryMethod,'getTamuList','getRapatCalendar'].map(name=>({name,...env.measure(name)}));}};
}
module.exports={BASE,startupEnvironment};
