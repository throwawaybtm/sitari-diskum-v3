/** Fonnte token remains server-only in Script Properties. No automatic sends on page load. */
/** Normalize Indonesian WhatsApp phone strings into 62-prefixed digits for Fonnte. */
function normalizeVisitWhatsappPhone_(phone) {
  let target=String(phone||'').replace(/[\s().+-]/g,'');
  if(!/^\d{8,15}$/.test(target))throw new Error('Nomor WhatsApp penerima tidak valid.');
  if(target.startsWith('0062'))target='62'+target.slice(4);
  else if(target.startsWith('0'))target='62'+target.slice(1);
  else if(target.startsWith('8'))target='62'+target;
  if(!/^\d{8,15}$/.test(target))throw new Error('Nomor WhatsApp penerima tidak valid.');
  return target;
}

const FONNTE_DISABLED_MESSAGE_ = 'Integrasi WhatsApp Fonnte dinonaktifkan pada mode pengembangan publik.';

function isFonnteDisabled_(properties) {
  const props = properties || (typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null);
  const explicit = String((props && props.getProperty('FONNTE_DISABLED')) || '').trim().toLowerCase();
  if (explicit === 'true') return true;
  if (typeof isPublicDevMode_ === 'function' && isPublicDevMode_(props)) {
    return typeof PUBLIC_DEV_ENV_CONFIG_ === 'undefined' || PUBLIC_DEV_ENV_CONFIG_.disableFonnte !== false;
  }
  return false;
}

function sendVisitWhatsapp_(phone,message) {
  if(isFonnteDisabled_()) {
    return {success:true,sent:false,skipped:true,disabled:true,delivery:'disabled',reason:FONNTE_DISABLED_MESSAGE_,at:new Date().toISOString()};
  }
  const token=PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN');
  if(!token)throw new Error('Fonnte belum dikonfigurasi. Simpan FONNTE_TOKEN di Script Properties dan hubungkan perangkat WhatsApp.');
  const target=normalizeVisitWhatsappPhone_(phone);
  const response=UrlFetchApp.fetch('https://api.fonnte.com/send',{method:'post',headers:{Authorization:token},payload:{target:target,message:message,countryCode:'62',connectOnly:'true'},muteHttpExceptions:true});
  let body;try{body=JSON.parse(response.getContentText());}catch(error){throw new Error('Fonnte memberikan respons yang tidak valid.');}
  if(response.getResponseCode()<200||response.getResponseCode()>=300||body.status!==true)throw new Error('Fonnte belum menerima pesan. Periksa koneksi perangkat, nomor tujuan, dan kuota layanan.');
  return {success:true,accepted:true,delivery:'pending',at:new Date().toISOString()};
}

/** "2026-11-20" -> "Jumat, 20 November 2026"; falls back to the raw value. */
function visitHariTanggal_(isoDate) {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate||''));
  if(!m)return String(isoDate||'-');
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  const hari=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getUTCDay()];
  const bulan=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getUTCMonth()];
  return hari+', '+(+m[3])+' '+bulan+' '+m[1];
}

/** Phone of the visit's (first) Penerima Tamu from VISIT_PIC_CONTACTS, matched by name then id; '' if unknown. */
function visitPicPhone_(visit) {
  const directory=typeof VISIT_PIC_CONTACTS==='undefined'?[]:VISIT_PIC_CONTACTS;
  const name=String((visit&&visit.lo_nama)||'').split(';')[0].trim();
  const id=String((visit&&visit.lo_id)||'').split(';')[0].trim();
  const item=(name&&directory.find(d=>d.pic===name))||(id&&directory.find(d=>String(d.id)===id));
  return item&&item.phone?String(item.phone):'';
}

/**
 * WhatsApp text for a visit. audience 'contact' = Narahubung, otherwise Penerima Tamu (PIC).
 * info (optional): {pic, picPhone, nomorSurat, linkSurat}. Missing values show as '-'.
 */
function visitWhatsappMessage_(visit,schedule,audience,info) {
  const v=visit||{},s=schedule||{},x=info||{};
  const val=value=>{const t=String(value==null?'':value).trim();return t||'-';};
  const hariTanggal=visitHariTanggal_(s.tanggal||v.tanggal_kunjungan);
  const waktu=val(s.jam||v.jam_kunjungan);
  const pic=val(x.pic||v.lo_nama);
  const picPhone=val(x.picPhone||visitPicPhone_(v));
  if(audience==='contact') {
    return ['Assalamu\'alaikum Warahmatullahi Wabarakatuh,','Yth. '+val(v.ketua_nama)+',','',
      'Terima kasih telah mengisi formulir pra-kunjungan pada SITARI DISKUM Dinas Koperasi dan Usaha Mikro Kota Batam.',
      'Permohonan kunjungan dari '+val(v.instansi)+' (Surat No: '+val(x.nomorSurat)+') telah terkonfirmasi dengan detail agenda berikut:',
      '📌 Agenda: '+val(v.keperluan),
      '🗓️ Hari/Tanggal: '+hariTanggal,
      '⏰ Waktu: '+waktu+' WIB s.d. selesai',
      '👥 Jumlah Peserta: '+val(v.jumlah_orang)+' Orang',
      '📍 Lokasi: Dinas Koperasi dan Usaha Mikro Kota Batam (Jl. Pramuka, Sungai Harapan, Sekupang)',
      '👤 Pejabat Penerima: '+pic,'',
      'Catatan Kedatangan:',
      'Mohon menginformasikan kepada narahubung kami ('+pic+' - '+picPhone+') apabila terdapat perubahan jadwal atau jumlah peserta.',
      'Setibanya di kantor, silakan menuju meja resepsionis untuk proses check-in tamu.',
      'Terima kasih atas perhatian dan kerja samanya.','',
      'Salam hangat,','Admin SITARI DISKUM','Dinas Koperasi dan Usaha Mikro Kota Batam'].join('\n');
  }
  return ['Assalamu\'alaikum Warahmatullahi Wabarakatuh,','Yth. '+pic+',','',
    'Izin menginformasikan jadwal penerimaan tamu dinas yang telah terkonfirmasi pada sistem SITARI DISKUM dengan detail berikut:',
    '🏛️ Instansi: '+val(v.instansi),
    '📄 Nomor Surat: '+val(x.nomorSurat),
    '📌 Agenda/Topik: '+val(v.keperluan),
    '🗓️ Hari/Tanggal: '+hariTanggal,
    '⏰ Waktu: '+waktu+' WIB s.d. selesai',
    '👥 Jumlah Tamu: '+val(v.jumlah_orang)+' Orang',
    '📞 Narahubung Tamu: '+val(v.ketua_nama)+' ('+val(v.narahubung_hp)+')',
    '📎 File Surat: '+val(x.linkSurat),'',
    'Mohon berkenan mempersiapkan materi/data dukung terkait topik di atas. Jika terdapat penyesuaian pejabat penerima atau perwakilan, silakan konfirmasi melalui Admin SITARI DISKUM.','',
    'Terima kasih.','Admin SITARI DISKUM','Dinas Koperasi dan Usaha Mikro Kota Batam'].join('\n');
}

function notifyVisitPics_(visit,previous,schedule) {
  const fonnteDisabled=isFonnteDisabled_();
  if(!fonnteDisabled&&!PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN'))throw new Error('Fonnte belum dikonfigurasi. Simpan FONNTE_TOKEN di Script Properties.');
  const directory=VISIT_PIC_CONTACTS;
  const ids=String(visit.lo_id||'').split(';').map(s=>s.trim());
  return String(visit.lo_nama||'').split(';').map(s=>s.trim()).filter(Boolean).map((pic,idx)=>{
    const saved=(previous||[]).find(n=>n.pic===pic&&n.success);if(saved)return saved;
    const item=directory.find(d=>d.pic===pic)||(ids[idx]?directory.find(d=>d.id===ids[idx]):null);
    try {if(!item)throw new Error('Kontak PIC belum tersedia.');return Object.assign({pic:pic},sendVisitWhatsapp_(item.phone,visitWhatsappMessage_(visit,schedule,'pic',{pic:pic})));}
    catch(error){return {pic:pic,success:false,error:error.message};}
  });
}
