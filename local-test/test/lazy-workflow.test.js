'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  const reads=[],cells={};
  function sheet(name,rows){return {getLastRow:()=>rows.length,getLastColumn:()=>Math.max(...rows.map(r=>r.length)),getRange(row,col,count=1,width=1){return {
    getValues(){reads.push({name,row,count,width});return rows.slice(row-1,row-1+count).map(r=>Array.from({length:width},(_,i)=>r[col-1+i]??''));},
    createTextFinder(text){let exact=false;return {matchEntireCell(v){exact=v;return this;},matchCase(){return this;},useRegularExpression(){return this;},findNext(){const i=rows.findIndex((r,i)=>i>=row-1&&i<row-1+count&&(exact?String(r[col-1])===text:String(r[col-1]).includes(text)));return i<0?null:{getRow:()=>i+1};}};}
  };}};}
  const visit=Array(20).fill('');Object.assign(visit,{0:1,1:'TLD-1',2:'luar_daerah',3:'Asal',5:1,6:'Ketua',12:'2026-10-31',13:'09:00',19:'Menunggu Kedatangan'});
  const other=visit.slice();other[1]='TLD-10';other[3]='Other';
  const state={version:2,status:'Menunggu Kedatangan',booking:{id:10},files:{},notifications:[],history:[]};
  const rows={Data_Tamu:[[],other,visit],Alur_Kunjungan:[[],['TLD-10',1,JSON.stringify(state),''],['TLD-1',2,JSON.stringify(state),'']],Data_Presensi:[[],[1,10,'','','Ketua','','Jabatan','','','now']],Master_Ruangan:[[],[1,'Ruang Rapat Utama Diskum',50]],Master_Pegawai:[[],[1,'NIP','Pegawai','Jabatan','Dinas']],Master_OPD:[[],[1,'OPD','Kategori']],Dokumen_Agenda:[[],[10,JSON.stringify({name:'Notula',url:'https://example.invalid/file'}),'']]};
  Object.entries(rows).forEach(([name,value])=>cells[name]=sheet(name,value));
  const cache=new Map(),cacheWrites=[];
  const ss={getId:()=> 'test-db',getSheetByName:name=>cells[name]};
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'true'})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value,ttl)=>{cache.set(key,value);cacheWrites.push(ttl);},remove:key=>cache.delete(key)})},Utilities:{formatDate:()=> '2026-10-31'}});
  for(const f of ['Code.js','VisitWorkflow.js','VisitWorkflowStorage.js','VisitArchive.js','AgendaDocuments.js','MeetingRooms.js','VisitPicContacts.js'])vm.runInContext(fs.readFileSync('Admin/'+f,'utf8'),c);
  c.getSpreadsheet=()=>ss;
  return {c,ss,reads,rows,cache,cacheWrites};
}
test('Konfirmasi reads only the exact visitor and workflow rows, not full tables or other tab data',()=>{
  const {c,reads}=setup(),res=c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:0});assert.equal(res.success,true,res.error);
  assert.equal(res.data.visit.instansi,'Asal');assert.deepEqual(Array.from(res.data.loadedTabs),[0]);assert.equal(res.data.limited,true);
  assert.deepEqual(reads.map(r=>r.name),['Data_Tamu','Alur_Kunjungan']);assert.ok(reads.every(r=>r.count===1));
});
test('tab data is fetched only when needed and unavailable tabs are rejected',()=>{
  for(const [tab,expected]of [[2,'Master_Ruangan'],[3,'Data_Presensi'],[4,null],[5,null]]){
    const {c,reads}=setup(),res=c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab});
    if(expected){assert.equal(res.success,true,res.error);assert.ok(reads.some(r=>r.name===expected));assert.ok(!reads.some(r=>['Master_Pegawai','Master_OPD','Dokumen_Agenda'].includes(r.name)));}
    else assert.equal(res.success,false);
  }
  const {c,reads,rows}=setup();const state=JSON.parse(rows.Alur_Kunjungan[2][2]);state.status='Selesai';rows.Alur_Kunjungan[2][2]=JSON.stringify(state);
  const res=c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:5});assert.equal(res.success,true,res.error);assert.ok(reads.some(r=>r.name==='Dokumen_Agenda'));assert.ok(!reads.some(r=>['Data_Presensi','Master_Ruangan'].includes(r.name)));
});
test('missing IDs, malformed tab requests and unauthorized access cannot load visit data',()=>{
  const {c,reads}=setup();assert.equal(c.getVisitWorkflow({kode_kunjungan:'TLD-',tab:0}).success,false);
  assert.equal(c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:99}).success,false);
  c.requireVisitAdmin_=()=>{throw new Error('Denied');};reads.length=0;assert.equal(c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:0}).success,false);assert.equal(reads.length,0);
});
test('master read cache hits skip sheet reads, expires at 120 seconds and handles cache failures',()=>{
  const {c,reads,cache,cacheWrites}=setup();assert.equal(c.getMasterData().data.pegawai.length,1);reads.length=0;c.getMasterData();assert.equal(reads.length,0);assert.ok(cacheWrites.every(t=>t===120));
  cache.clear();c.getMasterData();assert.ok(reads.length>0);reads.length=0;
  c.CacheService={getScriptCache(){throw new Error('Unavailable');}};assert.equal(c.getMasterData().data.pegawai.length,1);assert.ok(reads.length>0);
});
test('booking-validation room reads bypass the display cache',()=>{
  const {c,ss,reads,rows}=setup();c.getMeetingRoomOptions();rows.Master_Ruangan[1][1]='Removed room';reads.length=0;
  assert.equal(c.getMeetingRoomOptions().data.ruangan.length,1);assert.equal(c.readMeetingRoomOptions_(ss).length,0);assert.ok(reads.some(r=>r.name==='Master_Ruangan'));
});
test('a visit without workflow imports only its own legacy evidence row',()=>{
  const {c,rows,ss,reads}=setup();rows.Alur_Kunjungan.length=1;
  ss.getSheetByName=(original=>name=>name==='Kendali_SPPD'?{getLastRow:()=>3,getLastColumn:()=>9,getRange(row,col,count,width){return {createTextFinder:()=>({matchEntireCell(){return this;},matchCase(){return this;},useRegularExpression(){return this;},findNext:()=>({getRow:()=>3})}),getValues:()=>{reads.push({name,row,count,width});assert.equal(row,3);assert.equal(count,1);return [[1,1,'TLD-1','','','photo.pdf','attendance.pdf','notes.pdf']];}};}}:original(name))(ss.getSheetByName);
  c.getSppdList=()=>{throw new Error('Full legacy scan is forbidden');};const result=c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:0});assert.equal(result.success,true,result.error);assert.equal(result.data.workflow.files.foto.url,'photo.pdf');
});

test('local tab responses expose only the requested stage data and retain full API compatibility',()=>{
  const store=require('../fixtures').createFixtureStore(new Date('2026-11-02T05:00:00Z'),{
    seed:{visitors:[{
      id:1,kode_kunjungan:'TLD-02112026-001',tipe_tamu:'luar_daerah',instansi:'Dinas Koperasi Uji',alamat:'Batam',
      jumlah_orang:2,ketua_nama:'Ketua Uji',pengikut_list:'Anggota Uji',tujuan_bidang:'Sekretariat',
      keperluan:'Koordinasi',narahubung_hp:'081200000001',tanggal_kunjungan:'2026-11-02',jam_kunjungan:'09:00',
      lo_nama:'PIC Uji',bawa_sppd:true,status_kunjungan:'Menunggu Konfirmasi'
    }]}
  });const visit=store.responses.getTamuList.data.find(v=>v.tipe_tamu==='luar_daerah');
  const full=store.handleMutation('getVisitWorkflow',{kode_kunjungan:visit.kode_kunjungan});assert.equal(full.success,true);assert.ok(!full.data.limited);
  const tab=store.handleMutation('getVisitWorkflow',{kode_kunjungan:visit.kode_kunjungan,tab:0});assert.equal(tab.success,true);assert.equal(tab.data.limited,true);assert.equal(tab.data.rooms.length,0);assert.equal(tab.data.attendance.length,0);assert.equal(tab.data.archiveSources.length,0);
});

test('Kedatangan joins attendance by agenda ID even when attendance was recorded on a later date',()=>{
  const {c,rows}=setup();rows.Data_Tamu[2][12]='2026-11-02';const state=JSON.parse(rows.Alur_Kunjungan[2][2]);state.booking.tanggal='2026-11-02';rows.Alur_Kunjungan[2][2]=JSON.stringify(state);rows.Data_Presensi[1][9]='2026-11-03 09:00:00';
  const res=c.getVisitWorkflow({kode_kunjungan:'TLD-1',tab:3});assert.equal(res.success,true,res.error);assert.equal(res.data.attendance.length,1);assert.equal(res.data.attendance[0].nama,'Ketua');assert.equal(res.data.visit.tanggal_kunjungan,'2026-11-02');
});
