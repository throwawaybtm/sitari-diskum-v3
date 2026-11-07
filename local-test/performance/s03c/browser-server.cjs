'use strict';
const path=require('node:path'),fs=require('node:fs');
const {createServer,renderApp}=require('../s02/browser-server.cjs');
const {original}=require('./frontend.cjs');
const {createEnvironment}=require('../s02/synthetic.cjs');
const baseline=original('Index.html').replace("<?!= include('AgendaSearch'); ?>",original('AgendaSearch.html'));
const extra=fs.readFileSync(path.join(__dirname,'browser.js'),'utf8');
function render(url){
 const html=renderApp(url.searchParams.get('variant')==='before'?{indexHtml:baseline}:{}),end=html.lastIndexOf('</body>');
 return html.slice(0,end)+'<script>'+extra+'</script>'+html.slice(end);
}
const server=createServer({environment:createEnvironment({size:200,profile:'representative'}),render,runner:path.join(__dirname,'runner.html')});
if(require.main===module)server.listen(4174,'127.0.0.1',()=>console.log('S03C paired read-only browser: http://127.0.0.1:4174/'));
module.exports={server};
