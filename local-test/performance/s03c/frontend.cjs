'use strict';
const cp=require('node:child_process');
const {createFrontend}=require('../s02/frontend.cjs');
const BASE='8c995281cf30ae8fe95ebc643bc25059e8015d1e';
const original=file=>cp.execFileSync('git',['show',BASE+':Admin/'+file],{encoding:'utf8',maxBuffer:2*1024*1024});
function frontend({baseline=false,...options}={}) {
  return createFrontend({...options,...(baseline?{indexHtml:original('Index.html'),searchHtml:original('AgendaSearch.html')}:{})});
}
module.exports={BASE,original,frontend};
