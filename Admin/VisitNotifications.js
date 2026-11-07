/** Fonnte token remains server-only in Script Properties. No automatic sends on page load. */
function sendVisitWhatsapp_(phone,message) {
  const token=PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN');
  if(!token)throw new Error('Fonnte belum dikonfigurasi. Simpan FONNTE_TOKEN di Script Properties dan hubungkan perangkat WhatsApp.');
  const target=String(phone||'').replace(/[\s()+-]/g,'');
  if(!/^\d{8,15}$/.test(target))throw new Error('Nomor WhatsApp penerima tidak valid.');
  const response=UrlFetchApp.fetch('https://api.fonnte.com/send',{method:'post',headers:{Authorization:token},payload:{target:target,message:message,countryCode:'62',connectOnly:'true'},muteHttpExceptions:true});
  let body;try{body=JSON.parse(response.getContentText());}catch(error){throw new Error('Fonnte memberikan respons yang tidak valid.');}
  if(response.getResponseCode()<200||response.getResponseCode()>=300||body.status!==true)throw new Error('Fonnte belum menerima pesan. Periksa koneksi perangkat, nomor tujuan, dan kuota layanan.');
  return {success:true,accepted:true,delivery:'pending',at:new Date().toISOString()};
}

function visitWhatsappMessage_(visit,schedule,audience) {
  const date=String(schedule.tanggal||visit.tanggal_kunjungan||'').split('-').reverse().join('-');
  return ['SI-TARI DISKUM',audience==='contact'?'Informasi jadwal kunjungan Anda:':'Informasi permohonan kunjungan:',
    'ID: '+visit.kode_kunjungan,'Instansi: '+visit.instansi,'Agenda: '+visit.keperluan,
    'Jadwal: '+date+' '+(schedule.jam||visit.jam_kunjungan||'-')+' WIB',
    'Bidang tujuan: '+visit.tujuan_bidang,'Penerima tamu: '+visit.lo_nama].join('\n');
}

function notifyVisitPics_(visit,previous,schedule) {
  if(!PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN'))throw new Error('Fonnte belum dikonfigurasi. Simpan FONNTE_TOKEN di Script Properties.');
  const directory=VISIT_PIC_CONTACTS;
  return String(visit.lo_nama||'').split(';').map(s=>s.trim()).filter(Boolean).map(pic=>{
    const saved=(previous||[]).find(n=>n.pic===pic&&n.success);if(saved)return saved;
    const item=directory.find(d=>d.pic===pic);
    try {if(!item)throw new Error('Kontak PIC belum tersedia.');return Object.assign({pic:pic},sendVisitWhatsapp_(item.phone,visitWhatsappMessage_(visit,schedule,'pic')));}
    catch(error){return {pic:pic,success:false,error:error.message};}
  });
}
