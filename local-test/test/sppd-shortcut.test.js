'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('dashboard SPPD shortcut filters actionable visits and can return to the full guest book',()=>{
  const html=fs.readFileSync('Admin/Index.html','utf8');
  const filter={dataset:{status:''},classList:{add(){},remove(){}}};
  const fields={visitStatusFilter:filter,visitSearch:{value:'stale search'},visitSearchDate:{value:'2099-01-01'},tamuTableBody:{innerHTML:''}};
  const rows=[{kode_kunjungan:'READY',status_kunjungan:'Kelola SPPD'},{kode_kunjungan:'DONE',status_kunjungan:'Selesai'},{kode_kunjungan:'PENDING',status_kunjungan:'Menunggu Konfirmasi'},{kode_kunjungan:'LEGACY',bawa_sppd:1},{kode_kunjungan:'FO',tipe_tamu:'dalam_daerah_fo',status_kunjungan:'Kelola SPPD'}];
  const c=vm.createContext({allTamuData:rows,tamuTableState:{},window:{matchMedia:()=>({matches:false})},document:{getElementById:id=>fields[id]||null},getSortedTamu:r=>r,updateTamuSortHeadings(){},renderVisitRow:r=>r.kode_kunjungan,renderTableState:(target)=>{target.innerHTML='empty';}});
  vm.runInContext(fs.readFileSync('Admin/AgendaSearch.html','utf8').match(/<script>([^]*?)<\/script>/)[1],c);
  for(const name of ['getVisitStatus','clearVisitStatusFilter','openSppdVisits','renderTamuTable','switchTab']){
    const source=html.match(new RegExp('    function '+name+'\\([^]*?\\n    \\}'))?.[0];assert.ok(source,name);vm.runInContext(source,c);
  }
  c.openSppdVisits();assert.equal(fields.visitSearch.value,'');assert.equal(fields.visitSearchDate.value,'');
  assert.equal(filter.dataset.status,'Kelola SPPD');assert.equal(fields.tamuTableBody.innerHTML,'READYLEGACY');
  rows[0].status_kunjungan='Selesai';c.renderTamuTable(rows);assert.equal(fields.tamuTableBody.innerHTML,'LEGACY');
  c.clearVisitStatusFilter();assert.equal(fields.tamuTableBody.innerHTML,'READYDONEPENDINGLEGACYFO');
  c.openSppdVisits();c.switchTab('tamu');assert.equal(filter.dataset.status,'');
});
