/** Ordered archive manifest. All retrieval is constrained to documents on this visit. */
function visitDriveFileId_(url) {
  const match=/^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|document\/d\/|open\?(?:[^#]*&)?id=)([A-Za-z0-9_-]+)/.exec(String(url||''));
  return match?match[1]:null;
}
function visitDocumentUrls_(value) {
  if (Array.isArray(value)) return value.filter(url => typeof url === 'string' && url.trim());
  const text = String(value || '').trim();
  if (!text) return [];
  if (text[0] === '[') {
    try { const parsed = JSON.parse(text); return Array.isArray(parsed) ? visitDocumentUrls_(parsed) : []; } catch (error) { return []; }
  }
  return [text];
}
function visitDocumentSources_(value,label) {
  const urls=visitDocumentUrls_(value);
  return urls.map((url,index)=>({name:label+(urls.length>1?' '+(index+1):''),url}));
}
function visitArchiveSources_(data,notula) {
  const v=data.visit,w=data.workflow,items=[
    ...visitDocumentSources_(v.surat_kunjungan_file,'Surat Permohonan Kunjungan'),
    ...visitDocumentSources_(v.surat_tugas_file,'Surat Tugas Rombongan'),
    w.disposisi,w.files.absen,w.files.foto,notula,w.files.notulen,w.signed
  ];
  const seen={};return items.filter(item=>{if(!item||!item.url||seen[item.url])return false;seen[item.url]=true;return true;});
}
function escapeVisitPdfHtml_(text){return String(text??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function buildVisitAttendanceHtml_(data) {
  const e=escapeVisitPdfHtml_,v=data.visit,b=data.workflow.booking||{};
  let rows=Array.isArray(data.attendance)?data.attendance:[];
  if(typeof sortAttendanceRecords_==='function'){
    let employees=data.employees;
    if(!employees&&rows.some(r=>{if(String(r&&r.member_id||'').trim())return false;const cat=String(r&&(r.kategori??r.kategori_peserta)||'').trim();return !cat||cat==='Diskum'||cat==='Internal';})){
      if(typeof readMasterEmployeesForOrder_==='function')employees=readMasterEmployeesForOrder_(typeof getSpreadsheet==='function'?getSpreadsheet():null);
    }
    rows=sortAttendanceRecords_(rows,'Asia/Jakarta',employees?{employees}:undefined);
  }
  return '<html><head><meta charset="utf-8"><style>@page{size:A4;margin:22mm}body{font:11pt Arial;color:#172f38}h1{font-size:17pt}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #9cabb1;padding:8px;text-align:left}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1>Daftar Hadir Kunjungan</h1><p>SI-TARI DISKUM<br>'+e(v.kode_kunjungan)+'<br>'+e(v.instansi)+'<br>'+e(v.keperluan)+'<br>'+e(String(b.tanggal||v.tanggal_kunjungan).split('-').reverse().join('-'))+'</p><table><thead><tr><th>No.</th><th>Nama</th><th>Jabatan</th></tr></thead><tbody>'+rows.map((a,i)=>'<tr><td>'+(i+1)+'</td><td>'+e(a.nama)+'</td><td>'+e(a.jabatan||'-')+'</td></tr>').join('')+'</tbody></table></body></html>';
}
function generateVisitAttendancePdf_(data) {
  const blob=HtmlService.createHtmlOutput(buildVisitAttendanceHtml_(data)).getBlob().getAs(MimeType.PDF).setName('Daftar_Hadir_'+data.visit.kode_kunjungan+'.pdf');
  return saveVisitWorkflowFile_({name:blob.getName(),data:'data:application/pdf;base64,'+Utilities.base64Encode(blob.getBytes())},data.visit.kode_kunjungan,'daftar-hadir');
}
function getVisitArchiveDocument(payload) {
  try {
    requireVisitAdmin_();const data=readVisitWorkflow_(payload.kode_kunjungan);
    if(data.workflow.status!=='Selesai')throw new Error('Arsip gabungan tersedia setelah kunjungan selesai.');
    const sources=visitArchiveSources_(data,getAgendaNotula_(data.workflow.booking&&data.workflow.booking.id));
    if(!Number.isInteger(payload.index)||payload.index<0||payload.index>=sources.length)throw new Error('Dokumen arsip tidak ditemukan.');
    const source=sources[payload.index],id=visitDriveFileId_(source.url);
    if(!id)throw new Error('Tautan dokumen tidak didukung: '+source.name);
    const file=DriveApp.getFileById(id);let blob=file.getBlob(),mime=blob.getContentType();
    if(mime==='application/vnd.google-apps.document'){blob=file.getAs(MimeType.PDF);mime='application/pdf';}
    if(/^image\//.test(mime)&&!['image/jpeg','image/png'].includes(mime)){try{blob=blob.getAs('image/png');mime='image/png';}catch(error){throw new Error('Ubah foto '+source.name+' ke JPG/PNG agar dapat digabungkan.');}}
    if(!['application/pdf','image/jpeg','image/png'].includes(mime))throw new Error('Format dokumen belum didukung untuk arsip: '+source.name);
    return {success:true,data:{name:source.name||file.getName(),mime:mime,base64:Utilities.base64Encode(blob.getBytes())}};
  } catch(error){return {success:false,error:error.message};}
}
