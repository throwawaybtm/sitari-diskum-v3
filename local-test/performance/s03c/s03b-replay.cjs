'use strict';
// Replay the historical S03B comparison from immutable sources, not S03C HTML.
const cp=require('node:child_process'),path=require('node:path');
const {createServer,renderApp}=require('../s02/browser-server.cjs');
const {startupEnvironment,BASE:BEFORE}=require('../s03b/startup.cjs');
const {BASE:AFTER}=require('./frontend.cjs');
const file=(commit,name)=>cp.execFileSync('git',['show',commit+':Admin/'+name],{encoding:'utf8',maxBuffer:2*1024*1024});
const html=Object.fromEntries([['before',BEFORE],['after',AFTER]].map(([key,commit])=>[key,file(commit,'Index.html').replace("<?!= include('AgendaSearch'); ?>",file(commit,'AgendaSearch.html'))]));
const before=startupEnvironment({baseline:true,size:200}),after=startupEnvironment({size:200});
const server=createServer({environment:{measure(name,payload){return (name==='getDashboardData'?before:after).measure(name,payload);}},render:url=>renderApp({indexHtml:html[url.searchParams.get('variant')==='before'?'before':'after']}),runner:path.join(__dirname,'../s03b/runner.html')});
if(require.main===module)server.listen(4175,'127.0.0.1',()=>console.log('Pinned S03B replay: http://127.0.0.1:4175/'));
module.exports={server};
