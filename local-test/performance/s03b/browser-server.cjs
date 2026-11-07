'use strict';
const cp=require('node:child_process'),path=require('node:path');
const {createServer,renderApp}=require('../s02/browser-server.cjs');
const {startupEnvironment,BASE}=require('./startup.cjs');
const before=startupEnvironment({baseline:true,size:200}),after=startupEnvironment({size:200});
const baselineHtml=cp.execFileSync('git',['show',BASE+':Admin/Index.html'],{encoding:'utf8',maxBuffer:1024*1024});
// Other endpoint functions and includes are unchanged; only the summary endpoint differs.
const server=createServer({environment:{measure(name,payload){return (name==='getDashboardData'?before:after).measure(name,payload);}},render:url=>renderApp(url.searchParams.get('variant')==='before'?{indexHtml:baselineHtml}:{}),runner:path.join(__dirname,'runner.html')});
if(require.main===module)server.listen(4174,'127.0.0.1',()=>console.log('S03B paired synthetic browser runner: http://127.0.0.1:4174/'));
module.exports={server};
