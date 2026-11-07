'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createEnvironment,ROOT}=require('./synthetic.cjs');
const RPCS=new Set(['getDashboardData','getDashboardSummary','getTamuList','getRapatCalendar','getVisitWorkflow']);
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://upload.wikimedia.org; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'";
function renderApp({indexHtml}={}){
  const roomContext=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(ROOT,'Admin/MeetingRooms.js'),'utf8'),roomContext);
  const rooms=vm.runInContext('JSON.stringify(MEETING_ROOM_DIRECTORY)',roomContext);
  let html=indexHtml===undefined?fs.readFileSync(path.join(ROOT,'Admin/Index.html'),'utf8'):indexHtml;
  html=html.replace(/<\?!= include\('([A-Za-z]+)'\); \?>/g,(_,file)=>fs.readFileSync(path.join(ROOT,'Admin',file+'.html'),'utf8'));
  html=html.replace(/<\?!= JSON.stringify\(meetingRooms\) \?>/g,rooms).replace(/<\?=[^]*?\?>/g,'/disabled');
  if(html.includes('<?'))throw Error('Unresolved template');
  const end=html.lastIndexOf('</body>');
  if(end<0)throw Error('Missing body boundary');
  return html.slice(0,end)+'<script src="/instrument.js"></script>'+html.slice(end);
}
function createServer({environment,render=()=>renderApp(),runner=path.join(__dirname,'runner.html')}={}){
  const env=environment||createEnvironment({size:200}),results=[];
  return http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',CSP);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const url=new URL(req.url,'http://127.0.0.1');
    try {
      if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403);return res.end('Local host only');}
      if(req.method==='GET'&&url.pathname==='/app'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(render(url));}
      if(req.method==='GET'&&url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(runner));}
      if(req.method==='GET'&&url.pathname==='/instrument.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(__dirname,'instrument.js')));}
      if(req.method==='GET'&&url.pathname==='/results'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(results));}
      if(req.method==='POST'&&url.pathname.startsWith('/api/')){
        const method=url.pathname.slice(5);if(!RPCS.has(method)){res.writeHead(405);return res.end('Read probes only');}
        let body='';for await(const chunk of req){body+=chunk;if(body.length>2000)throw Error('Oversize request');}
        const payload=JSON.parse(body||'{}');
        // getTamuList's optional argument is a spreadsheet, not the local fallback's {}.
        const measured=env.measure(method,method==='getVisitWorkflow'?payload:undefined);
        let safe=JSON.stringify({...measured.result,_s02:measured.metrics});
        safe=safe.replaceAll('https://drive.google.com/file/d/s02-synthetic-document/view','/preview');
        res.setHeader('Content-Type','application/json');return res.end(safe);
      }
      if(req.method==='POST'&&url.pathname==='/results'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('Oversize result');}
        const parsed=JSON.parse(body); // Only accept aggregate numeric diagnostics and fixed labels.
        if(!parsed||!Array.isArray(parsed.runs)||parsed.runs.length>40||!/^[\x20-\x7e]*$/.test(JSON.stringify(parsed)))throw Error('Invalid diagnostics');
        const allowed=new Set(['runs','environment','userAgent','width','height','dpr','firstObserved','variant','metrics','rpc','render','resources','longTasks','name','duration','handlerVmMs','callbackMs','bytes','count','sumMs','maxMs','category','start','end','navigationToSummaryPaint','navigationToAllDataPaint','modalShellMs','modalAuthoritativePaintMs','unloadedTabPaintMs','cachedTabPaintMs','attendanceTabPaintMs','domContentLoaded','loadEvent','longTaskCount','longTaskMs','failures','visibility']);
        function validate(value,key){if(key&&!allowed.has(key))throw Error('Unknown diagnostic key');if(Array.isArray(value))return value.forEach(v=>validate(v));if(value&&typeof value==='object')return Object.entries(value).forEach(([k,v])=>validate(v,k));if(typeof value==='string'&&(/https?:|@|S02-VISIT|Synthetic person/.test(value)))throw Error('Record/URL excluded');}
        validate(parsed);results.push(parsed);return res.end('Stored numeric diagnostics');
      }
      if(url.pathname==='/preview'){res.setHeader('Content-Type','text/html');return res.end('Synthetic document placeholder');}
      res.writeHead(404);res.end('Unavailable in isolated probe');
    }catch(error){res.writeHead(400);res.end('Probe failed: '+error.message);}
  });
}
if(require.main===module)createServer().listen(4174,'127.0.0.1',()=>console.log('S02 synthetic browser probe: http://127.0.0.1:4174 (200 rows; read-only RPC allowlist)'));
module.exports={createServer,renderApp,CSP};
