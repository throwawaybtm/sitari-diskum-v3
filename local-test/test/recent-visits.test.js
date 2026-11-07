'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../Admin/Index.html'),'utf8');
function functions(context,names){for(const name of names){const match=html.match(new RegExp('    function '+name+'\\([^]*?\\n    \\}'));assert.ok(match,name+' exists');vm.runInContext(match[0],context);}}
test('recent visits use the same six data cells as Buku Tamu and keep the Detail action',()=>{
  const fields={};const context=vm.createContext({document:{getElementById:id=>fields[id]||={},querySelectorAll:()=>[]},escapeHtml:v=>String(v??''),formatVisitDateCompact:v=>v});
  context.filterAgendaRecords_=require('../agenda-search').filter;
  vm.runInContext('const tamuTableState={key:null,direction:"asc"}',context);
  functions(context,['renderBidangBadges','getVisitStatus','renderVisitStatus','getSortedTamu','updateTamuSortHeadings','renderVisitRow','renderRecentTamu','renderTamuTable']);
  const visit={kode_kunjungan:'TLD-27102026-001',tipe_tamu:'luar_daerah',tanggal_kunjungan:'2026-10-27',jam_kunjungan:'09:00',instansi:'Instansi Asal',alamat:'Alamat Instansi',ketua_nama:'Ketua',jumlah_orang:3,narahubung_hp:'080000000001',tujuan_bidang:'Bidang Pengawasan Koperasi',keperluan:'Agenda Kunjungan',lo_nama:'Mery Sefina Simor, S.Kom.',status_kunjungan:'Menunggu Konfirmasi'};
  context.renderRecentTamu([visit]);context.renderTamuTable([visit]);
  const cells=s=>Array.from(s.matchAll(/<td\b[^>]*>([^]*?)<\/td>/g),m=>m[0]).slice(0,6);
  assert.deepEqual(cells(fields.recentTamuTableBody.innerHTML),cells(fields.tamuTableBody.innerHTML));
  assert.match(fields.recentTamuTableBody.innerHTML,/openRecentVisitDetail[^]*Detail/);
  assert.match(fields.recentTamuTableBody.innerHTML,/Alamat Instansi/);assert.match(fields.recentTamuTableBody.innerHTML,/Agenda Kunjungan/);
});
test('Detail selects Buku Tamu before opening the chosen visit modal',()=>{
  const calls=[],context=vm.createContext({switchTab:id=>calls.push(['tab',id]),openVisitWorkflow:(code,options)=>calls.push(['modal',code,options.readOnly])});
  functions(context,['openRecentVisitDetail']);context.openRecentVisitDetail('TLD-001',false);
  assert.deepEqual(calls,[['tab','tamu'],['modal','TLD-001',false]]);
});
test('Non-SPPD dashboard details open a read-only modal without approval actions',async()=>{
  const modal=fs.readFileSync(path.join(__dirname,'../../Admin/VisitModal.html'),'utf8'),fields={};let calls=0;
  const context=vm.createContext({document:{addEventListener(){},body:{style:{}},getElementById:id=>id==='visitDisposisi'?null:(fields[id]||={}),querySelector:()=>({focus(){}})},escapeHtml:v=>String(v??''),formatMeetingDate:v=>v,showToast(){},
    callBackend:(fn,args,success)=>{calls++;success({success:true,data:{visit:{kode_kunjungan:'TDD-001',tipe_tamu:'dalam_daerah_fo',instansi:'Usaha Lokal'},workflow:{status:'Non-SPPD'},stage:0}});}});
  vm.runInContext(modal.match(/<script>([^]*?)<\/script>/)[1],context);
  await context.openVisitWorkflow('TDD-001',{readOnly:true});
  assert.equal(fields.visitWorkflowModal.hidden,false);
  assert.doesNotMatch(fields.visitModalContent.innerHTML,/submitVisitAction\('confirm'\)/);
  assert.doesNotMatch(fields.visitModalTabs.innerHTML,/DISPOSISI/);
  await context.submitVisitAction('confirm');assert.equal(calls,1);
});

test('GAS dashboard supplies the contact and agenda fields used by the shared visitor row',()=>{
  const context=vm.createContext({Utilities:{formatDate:()=> '2026-10-27'}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../Admin/Code.js'),'utf8'),context);
  const row=[1,'TLD-27102026-001','luar_daerah','Instansi','Alamat',3,'Ketua','Anggota','Bidang','Agenda Kunjungan','Ketua','080000000001','2026-10-27','09:00','','','pic','PIC',1,'Menunggu Konfirmasi'];
  context.getSpreadsheet=()=>({getSheetByName:name=>name==='Data_Tamu'?{getLastRow:()=>2,getLastColumn:()=>21,getRange:()=>({getValues:()=>[row]})}:null});
  const recent=context.getDashboardData().data.recentTamu[0];
  assert.equal(recent.keperluan,'Agenda Kunjungan');assert.equal(recent.narahubung_hp,'080000000001');
});
