'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {jsPDF}=require('../vendor/jspdf.umd.min.js');
const html=fs.readFileSync(path.join(__dirname,'../../Admin/ArchiveClient.html'),'utf8');
function load(agenda='Pembahasan koperasi'){
  const downloads=[],blobs=[];
  const context=vm.createContext({Blob,jspdf:{jsPDF},formatMeetingDate:v=>v,showToast(){},URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},
    document:{addEventListener(){},createElement:()=>{const anchor={click(){downloads.push(anchor.download);}};return anchor;}}});
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1],context);
  context.data={visit:{kode_kunjungan:'TLD-27102026-001',instansi:'Instansi Uji',ketua_nama:'Ketua Uji',jumlah_orang:3,tujuan_bidang:'Bidang Pengawasan Koperasi',keperluan:agenda,lo_nama:'Mery Sefina Simor, S.Kom.'},workflow:{exported:{at:'now'},booking:{tanggal:'2026-10-27',nama_ruangan:'Ruang Rapat Utama Diskum'}}};
  vm.runInContext('visitModalData=data;',context);return {context,downloads,blobs};
}
test('archive summary is an actual PDF',()=>{const {context}=load();const bytes=context.buildVisitSummaryPdf_(context.data);const pdf=Buffer.from(bytes);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.toString('latin1'),/Arsip Kunjungan/);});
test('long visit details wrap onto additional summary pages',()=>{const {context}=load('Agenda panjang. '.repeat(600));const pdf=Buffer.from(context.buildVisitSummaryPdf_(context.data));assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);});
