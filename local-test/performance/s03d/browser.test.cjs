'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('browser instrumentation is passive, blocks mutations and records no arguments or response records',()=>{
 const {installS03DBrowserProbe}=require('./browser-probe.js');let sent=0,time=0;
 const w={performance:{now:()=>time++},requestAnimationFrame:fn=>fn(),addEventListener(){},removeEventListener(){},callBackend(name,args,ok){sent++;ok({success:true,data:{nama:'PRIVATE RECORD',url:'secret-url'}});}};
 const original=w.callBackend;assert.throws(()=>installS03DBrowserProbe(w,false));const p=installS03DBrowserProbe(w,true);assert.equal(sent,0);
 let denied=false;w.callBackend('saveVisitWorkflow',{token:'PRIVATE TOKEN'},null,()=>denied=true);assert.equal(sent,0);assert.equal(denied,true);
 for(const name of ['getDashboardSummary','getTamuList','getRapatCalendar'])w.callBackend(name,{contact:'PRIVATE CONTACT'},()=>{});
 assert.equal(sent,3);const s=p.snapshot();assert.equal(s.rpc.length,3);assert.equal(s.marks[0].label,'dashboard.usable');assert.ok(Number.isFinite(s.allDataReadyMs));assert.doesNotMatch(JSON.stringify(s),/PRIVATE|secret-url|contact/);
 assert.throws(()=>p.begin('PRIVATE NAME'));assert.equal(p.span('render.visitors',()=>42),42);assert.equal(p.snapshot().marks.at(-1).label,'render.visitors');p.stop();assert.equal(w.callBackend,original);
});
test('fixture export is synthetic at each cohort and PDF cross references point to valid objects',()=>{
 const {fixtures,pdf}=require('./fixtures.cjs');for(const n of [20,200,1000]){const f=fixtures(n);assert.equal(f.tables.Data_Tamu.length,n);assert.equal(f.tables.Data_Presensi.length,5*n);assert.ok(f.tables.Master_Pegawai.every(r=>String(r[2]).startsWith('Synthetic')));}
 assert.throws(()=>fixtures(100));const data=pdf(),s=data.toString();assert.match(s,/^%PDF-1\.4/);const offset=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(offset,offset+4),'xref');const entries=s.slice(offset).split('\n').slice(3,8);entries.forEach((entry,i)=>assert.ok(s.slice(Number(entry.slice(0,10))).startsWith((i+1)+' 0 obj')));
});
test('exported PNG has valid checksums for every chunk',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 cp.execFileSync(process.execPath,[path.join(__dirname,'fixtures.cjs'),'20']);
 const b=fs.readFileSync(path.join(__dirname,'../../../outputs/performance-s03d/fixtures-20/synthetic.png'));
 const crc=bytes=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 assert.equal(crc(Buffer.from('123456789')),0xcbf43926);
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 for(let at=8;at<b.length;){const size=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);assert.equal(crc(b.subarray(at+4,at+8+size)),b.readUInt32BE(at+8+size),type+' checksum');at+=size+12;}
});
