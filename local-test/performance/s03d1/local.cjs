'use strict';
const vm=require('node:vm'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {assemble,localConfig,ADMIN_READS,PUBLIC_READS}=require('./assemble.cjs');
const {fixtures,pdf}=require('../s03d/fixtures.cjs');
let cached;function assembly(){return cached||=assemble(localConfig());}
function createHarness({size=20,email='staging@example.invalid',scriptId}={}){
 const cfg=localConfig(),bundle=assembly(),tables=JSON.parse(JSON.stringify(fixtures(size).tables).replaceAll('s02-synthetic-document',cfg.documentIds[0]));
 tables.Foto_Agenda.forEach(row=>row[1]=JSON.stringify([{name:'Synthetic photo',url:'https://drive.google.com/file/d/'+cfg.documentIds[1]+'/view'}]));
 const state={email,opens:0,reads:0,files:0,calls:[],scriptId};
 const fail=()=>{throw Error('S03D1 local service denied');};
 const guard=methods=>new Proxy(Object.freeze(methods),{get:(o,k)=>Object.hasOwn(o,k)?o[k]:fail()});
 function sheet(name){const rows=tables[name];if(!rows)return null;return guard({getLastRow:()=>rows.length+1,getLastColumn:()=>Math.max(1,...rows.map(r=>r.length)),getRange:(row,col,count=1,width=1)=>{
  if(row<2||col<1||count<1||width<1)fail();
  return guard({getValues:()=>{state.reads++;return rows.slice(row-2,row-2+count).map(r=>Array.from({length:width},(_,i)=>r[col-1+i]??''));},getDisplayValues:()=>{state.reads++;return rows.slice(row-2,row-2+count).map(r=>Array.from({length:width},(_,i)=>String(r[col-1+i]??'')));},createTextFinder:code=>{const f=guard({matchEntireCell:()=>f,matchCase:()=>f,useRegularExpression:()=>f,findNext:()=>{const i=rows.findIndex(r=>String(r[col-1])===String(code));return i<0?null:guard({getRow:()=>i+2});}});return f;}});
 }});}
 const SpreadsheetApp=guard({openById:id=>{if(id!==cfg.spreadsheetId)fail();state.opens++;return guard({getSheetByName:sheet,getSpreadsheetTimeZone:()=> 'Asia/Jakarta'});}});
 const DriveApp=guard({getFileById:id=>{if(!cfg.documentIds.includes(id))fail();state.files++;const mime=state.mimeOverride||(id===cfg.documentIds[1]?'image/png':'application/pdf');return guard({getName:()=> 'Synthetic document',getMimeType:()=>mime,getBlob:()=>guard({getContentType:()=>mime,getBytes:()=>Array.from(mime==='application/pdf'?pdf():Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64'))})});}});
 const Session=guard({getActiveUser:()=>guard({getEmail:()=>state.email})});
 const Utilities=guard({base64Encode:b=>Buffer.from(b).toString('base64'),formatDate:(date,tz,format)=>{
  const d=date instanceof Date?date:new Date(date),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return format.replace(/yyyy|MM|dd|HH|mm|ss/g,k=>parts[{yyyy:'year',MM:'month',dd:'day',HH:'hour',mm:'minute',ss:'second'}[k]]);
 }});
 const output=content=>({getContent:()=>content,setTitle(){return this;},addMetaTag(){return this;}});
 const rendered=[];
 function htmlService(role){return guard({createHtmlOutput:output,createHtmlOutputFromFile:name=>{if(!Object.hasOwn(bundle[role],name+'.html'))fail();return output(bundle[role][name+'.html']);},createTemplateFromFile:name=>{
  if(!Object.hasOwn(bundle[role],name+'.html')||name==='StageGuard')fail();const template={};template.evaluate=()=>{rendered.push({role,name,context:template});return output(renderTemplate(bundle[role][name+'.html'],template));};return template;
 }});}
 const blocked=new Proxy({}, {get:fail});
 const admin=vm.createContext({SpreadsheetApp,DriveApp,Session,Utilities,HtmlService:htmlService('Admin'),ScriptApp:guard({getScriptId:()=>state.scriptId||cfg.adminProjectId}),UrlFetchApp:blocked,PropertiesService:blocked,CacheService:blocked,LockService:blocked,Logger:blocked,console:blocked});
 vm.runInContext(bundle.Admin['Code.js'],admin,{timeout:2000});
 const lib=guard(Object.fromEntries(ADMIN_READS.map(name=>[name,p=>{state.calls.push(name);return admin[name](p);}])));
 const pub=vm.createContext({SiTariCore:lib,Session,HtmlService:htmlService('Public'),ScriptApp:guard({getScriptId:()=>state.scriptId||cfg.publicProjectId}),SpreadsheetApp:blocked,DriveApp:blocked,PropertiesService:blocked,UrlFetchApp:blocked,CacheService:blocked,LockService:blocked,console:blocked});
 vm.runInContext(bundle.Public['Code.js'],pub,{timeout:2000});
 return {admin,public:pub,state,tables,bundle,cfg,rendered};
}
function renderTemplate(source,values){return source.replace(/<\?[=!]+([^]*?)\?>/g,(_,expr)=>String(vm.runInNewContext('('+expr.trim().replace(/;$/,'')+')',values,{timeout:1000})));}
function createServer(){const h=createHarness({size:200}),results=[];return http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'");
 if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403);return res.end('Denied');}
 const url=new URL(req.url,'http://127.0.0.1');try{
  if(req.method==='GET'&&['/admin','/public'].includes(url.pathname)){const role=url.pathname==='/admin'?'admin':'public';res.setHeader('Content-Type','text/html; charset=utf-8');let html=h[role].doGet({parameter:Object.fromEntries(url.searchParams)}).getContent();if(url.searchParams.get('check')==='1'){const end=html.lastIndexOf('</body>');html=html.slice(0,end)+'<script>'+fs.readFileSync(path.join(__dirname,'browser-check.js'),'utf8')+'</script>'+html.slice(end);}return res.end(html);}
  if(req.method==='GET'&&url.pathname==='/check'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(__dirname,'runner.html')));}
  if(req.method==='GET'&&url.pathname==='/results'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(results));}
  if(req.method==='POST'&&url.pathname==='/results'){let body='';for await(const chunk of req){body+=chunk;if(body.length>3000)throw Error('Oversize');}const r=JSON.parse(body);if(!r||Object.keys(r).sort().join(',')!=='failures,pages'||!Array.isArray(r.pages)||r.pages.length!==5||r.pages.some(x=>typeof x!=='number'||!Number.isInteger(x)||x<1||x>100)||!Number.isInteger(r.failures)||r.failures<0)throw Error('Invalid result');results.push(r);return res.end('Stored numeric checks');}
  if(req.method==='GET'&&url.pathname.startsWith('/preview/')){const id=url.pathname.slice(9);if(!h.cfg.documentIds.includes(id))throw Error('Denied');res.setHeader('Content-Type',id===h.cfg.documentIds[0]?'application/pdf':'image/png');return res.end(id===h.cfg.documentIds[0]?pdf():Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64'));}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){const role=req.headers['x-s03d1-role'];if(!['Admin','Public'].includes(role))throw Error('Role required');const name=url.pathname.slice(5),methods=role==='Admin'?ADMIN_READS:PUBLIC_READS;if(!methods.includes(name)){res.writeHead(405);return res.end('Read only');}let body='';for await(const chunk of req){body+=chunk;if(body.length>2000)throw Error('Oversize');}const result=h[role==='Admin'?'admin':'public'][name](JSON.parse(body||'{}'));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));}
  res.writeHead(404);res.end('Unavailable');
 }catch{res.writeHead(403);res.end('S03D1 read unavailable');}
 });}
if(require.main===module)createServer().listen(4176,'127.0.0.1',()=>console.log('Local synthetic staging only: http://127.0.0.1:4176/admin and /public'));
module.exports={createHarness,createServer,renderTemplate};
