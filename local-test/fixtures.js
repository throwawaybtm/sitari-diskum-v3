'use strict';
const fs=require('node:fs'),path=require('node:path');

const { prepareVisit, getPublicDestinations } = require('./tld-directory');
const { prepareVisit: prepareTddVisit } = require('./tdd-directory');
const { normalize: normalizeMeetingRooms } = require('./meeting-rooms');
const { createVisitWorkflow } = require('./visit-workflow');
const { jsPDF } = require('./vendor/jspdf.umd.min.js');

function jakartaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function jakartaTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function createFixtureStore(now = new Date(), options = {}) {
  const currentTime = typeof now === 'function' ? now : () => new Date(now);
  now = currentTime();
  const today = jakartaDate(now);
  const yesterday = jakartaDate(new Date(now.getTime() - 86400000));
  const tomorrow = jakartaDate(new Date(now.getTime() + 86400000));
  const destinations = getPublicDestinations();
  const visitDate = value => value.split('-').reverse().join('');

  const visitors = [
    {
      id: 9001,
      kode_kunjungan: `TLD-${visitDate(today)}-003`,
      tipe_tamu: 'luar_daerah',
      instansi: 'Dinas Koperasi Kabupaten Bukit Raya',
      alamat: 'Jl. Flamboyan No. 18, Bukit Raya',
      jumlah_orang: 4,
      ketua_nama: 'Reza Firmansyah, S.E.',
      pengikut_list: 'Laras Puspita, S.E.\nYoga Pradana\nAnisa Kartika, S.Kom.',
      tujuan_bidang: destinations[3].bidang,
      keperluan: 'Kunjungan koordinasi pembinaan dan penguatan kelembagaan koperasi.',
      narahubung_nama: 'Reza Firmansyah, S.E.',
      narahubung_hp: '080000000101',
      tanggal_kunjungan: today,
      jam_kunjungan: '09:00',
      surat_kunjungan_file: '',
      surat_tugas_file: '',
      lo_id: 8001,
      lo_nama: destinations[3].pic,
      bawa_sppd: true,
      status_kunjungan: 'Menunggu Konfirmasi'
    },
    {
      id: 9002,
      kode_kunjungan: `TDD-${visitDate(today)}-004`,
      tipe_tamu: 'dalam_daerah_fo',
      instansi: 'Kelompok Usaha Tunas Mandiri',
      alamat: 'Jl. Teratai No. 21, Batu Aji',
      jumlah_orang: 2,
      ketua_nama: 'Aulia Safitri',
      pengikut_list: '',
      tujuan_bidang: destinations[5].bidang,
      keperluan: 'Konsultasi perizinan usaha dan pemasaran produk makanan.',
      narahubung_nama: 'Aulia Safitri',
      narahubung_hp: '080000000102',
      tanggal_kunjungan: today,
      jam_kunjungan: '10:30',
      surat_kunjungan_file: '',
      surat_tugas_file: '',
      lo_id: 8002,
      lo_nama: destinations[5].pic,
      bawa_sppd: false,
      status_kunjungan: 'Non-SPPD'
    },
    {
      id: 9003,
      kode_kunjungan: `TLD-${visitDate(yesterday)}-001`,
      tipe_tamu: 'luar_daerah',
      instansi: 'Dinas Koperasi Kota Telaga Asri',
      alamat: 'Jl. Nusa Indah No. 9, Telaga Asri',
      jumlah_orang: 5,
      ketua_nama: 'Bagas Kurniawan, S.Sos.',
      pengikut_list: 'Putri Amalia\nFikri Ramadhan\nNabila Azzahra, S.E.\nGilang Permana',
      tujuan_bidang: destinations[0].bidang,
      keperluan: 'Pembahasan tata kelola administrasi dan layanan sekretariat.',
      narahubung_nama: 'Bagas Kurniawan, S.Sos.',
      narahubung_hp: '080000000103',
      tanggal_kunjungan: yesterday,
      jam_kunjungan: '13:15',
      surat_kunjungan_file: '',
      surat_tugas_file: '',
      lo_id: 8003,
      lo_nama: destinations[0].pic,
      bawa_sppd: true,
      status_kunjungan: 'Kelola SPPD'
    },
    {
      id: 9004,
      kode_kunjungan: `TDD-${visitDate(yesterday)}-002`,
      tipe_tamu: 'dalam_daerah_fo',
      instansi: 'Koperasi Sejahtera Bersama',
      alamat: 'Jl. Dahlia No. 14, Bengkong',
      jumlah_orang: 1,
      ketua_nama: 'Wahyu Santoso',
      pengikut_list: '',
      tujuan_bidang: destinations[6].bidang,
      keperluan: 'Permohonan informasi pelatihan manajemen usaha dan kewirausahaan.',
      narahubung_nama: 'Wahyu Santoso',
      narahubung_hp: '080000000104',
      tanggal_kunjungan: yesterday,
      jam_kunjungan: '15:00',
      surat_kunjungan_file: '',
      surat_tugas_file: '',
      lo_id: 8002,
      lo_nama: destinations[6].pic,
      bawa_sppd: false,
      status_kunjungan: 'Non-SPPD'
    }
  ];


  visitors.push({id:9005,kode_kunjungan:`TLD-${visitDate(yesterday)}-005`,tipe_tamu:'luar_daerah',
    instansi:'Dinas Koperasi Kabupaten Lembah Hijau',alamat:'Jl. Seroja No. 32, Lembah Hijau',jumlah_orang:3,
    ketua_nama:'Dian Prasetyo, S.E.',pengikut_list:'Tiara Wulandari\nDaffa Mahendra',
    tujuan_bidang:destinations[1].bidang+'; '+destinations[2].bidang,keperluan:'Koordinasi penyusunan rencana kerja serta penatausahaan keuangan.',
    narahubung_nama:'Dian Prasetyo, S.E.',narahubung_hp:'080000000105',tanggal_kunjungan:yesterday,jam_kunjungan:'10:00',
    surat_kunjungan_file:'',surat_tugas_file:'',lo_id:'sekretariat-perencanaan; sekretariat-keuangan',
    lo_nama:destinations[1].pic+'; '+destinations[2].pic,bawa_sppd:true,status_kunjungan:'Selesai'});

  const meetings = [
    {
      id: 7001,
      kode_rapat: `RPT-${today.replaceAll('-', '')}-001`,
      judul_rapat: 'Pembahasan Program Pembinaan Koperasi',
      ruangan_id: 6001,
      nama_ruangan: 'Ruang Rapat Utama Diskum',
      tanggal: today,
      jam_mulai: '09:30',
      jam_selesai: '11:00',
      penyelenggara_bidang: 'Sekretariat',
      pimpinan_rapat: 'Rini Handayani, S.E.',
      jumlah_peserta: 12,
      agenda: 'Pembahasan target pembinaan koperasi serta jadwal monitoring lapangan.',
      status: 'Terjadwal'
    },
    {
      id: 7002,
      kode_rapat: `RPT-${tomorrow.replaceAll('-', '')}-002`,
      judul_rapat: 'Persiapan Klinik Konsultasi Usaha Mikro',
      ruangan_id: 6002,
      nama_ruangan: 'Ruangan Bidang Koperasi & UMKM',
      tanggal: tomorrow,
      jam_mulai: '13:00',
      jam_selesai: '14:30',
      penyelenggara_bidang: 'Usaha Mikro',
      pimpinan_rapat: 'Bayu Saputro, S.E.',
      jumlah_peserta: 5,
      agenda: 'Persiapan materi konsultasi, jadwal layanan, dan pembagian tugas tim.',
      status: 'Terjadwal'
    }
  ];

  const sppd = [
    {
      id: 5001,
      tamu_id: 9001,
      kode_kunjungan: visitors[0].kode_kunjungan,
      instansi: visitors[0].instansi,
      ketua_nama: visitors[0].ketua_nama,
      file_foto: '',
      file_absen: '',
      file_notulen: '',
      status_sppd: 'Belum Lengkap',
      disetujui_pejabat_teknis: 0,
      pejabat_teknis_nama: '',
      waktu_persetujuan_teknis: '',
      disetujui_kasubag: 0,
      kasubag_nama: '',
      waktu_persetujuan_kasubag: '',
      catatan: 'Menunggu pelaksanaan kunjungan dan kelengkapan dokumen.'
    },
    {
      id: 5002,
      tamu_id: 9003,
      kode_kunjungan: visitors[2].kode_kunjungan,
      instansi: visitors[2].instansi,
      ketua_nama: visitors[2].ketua_nama,
      file_foto: '',
      file_absen: '',
      file_notulen: '',
      status_sppd: 'Menunggu Validasi Teknis',
      disetujui_pejabat_teknis: 0,
      pejabat_teknis_nama: '',
      waktu_persetujuan_teknis: '',
      disetujui_kasubag: 0,
      kasubag_nama: '',
      waktu_persetujuan_kasubag: '',
      catatan: 'Dokumentasi kegiatan dan daftar hadir telah diterima.'
    },
    {
      id: 5003,
      tamu_id: visitors[4].id,
      kode_kunjungan: visitors[4].kode_kunjungan,
      instansi: visitors[4].instansi,
      ketua_nama: visitors[4].ketua_nama,
      file_foto: '',
      file_absen: '',
      file_notulen: '',
      status_sppd: 'Sah & Terverifikasi',
      disetujui_pejabat_teknis: 1,
      pejabat_teknis_nama: 'Vina Oktaviani',
      waktu_persetujuan_teknis: `${yesterday} 16:00:00`,
      disetujui_kasubag: 1,
      kasubag_nama: 'Vina Oktaviani',
      waktu_persetujuan_kasubag: `${yesterday} 16:05:00`,
      catatan: 'Dokumen pengesahan telah ditandatangani dan diarsipkan.'
    }
  ];

  const masterData = {
    pegawai: [
      { id: 8001, nip: '-', nama: 'Rini Handayani, S.E.', jabatan: 'Analis Koperasi', bidang: 'Koperasi' },
      { id: 8002, nip: '-', nama: 'Bayu Saputro, S.E.', jabatan: 'Analis Usaha Mikro', bidang: 'Usaha Mikro' },
      { id: 8003, nip: '-', nama: 'Vina Oktaviani', jabatan: 'Pengelola Administrasi', bidang: 'Sekretariat' }
    ],
    opd: [
      { id: 4001, nama_opd: 'Dinas Perdagangan Kota Batam', kategori: 'Pemko Batam' },
      { id: 4002, nama_opd: 'Badan Perencanaan Pembangunan Daerah Kota Batam', kategori: 'Pemko Batam' }
    ],
    ruangan: [
      { id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50, fasilitas: 'Proyektor', lokasi: 'Lantai 1', warna: 'blue' },
      { id: 6002, nama_ruangan: 'Ruangan Bidang Koperasi & UMKM', kapasitas: 5, fasilitas: 'TV', lokasi: 'Lantai 1', warna: 'emerald' },
      { id: 6003, nama_ruangan: 'Ruang Rapat Pimpinan / Kadis', kapasitas: 10, fasilitas: '', lokasi: 'Lantai 1', warna: 'violet' },
      { id: 6005, nama_ruangan: 'Ruangan Rapat UPTD PLUT KUMKM', kapasitas: null, fasilitas: '', lokasi: 'Gedung PLUT', warna: 'cyan' }
    ]
  };

  if(options.deploymentPreview)masterData.pegawai=require('./previews/employee-directory.json').map((p,i)=>({...p,id:10001+i}));
  const visitWorkflow = createVisitWorkflow({ visitors, meetings, sppd, rooms: normalizeMeetingRooms(masterData.ruangan), currentTime });

  function previewDocument(title,visit,attendance) {
    const doc=new jsPDF({unit:'mm',format:'a4'});doc.setFont('times','bold');doc.setFontSize(16);doc.text(title,20,25);
    doc.setFont('times','normal');doc.setFontSize(11);let y=42;
    for(const text of [visit.kode_kunjungan,visit.instansi,visit.ketua_nama,visit.keperluan]){const lines=doc.splitTextToSize(String(text),170);doc.text(lines,20,y);y+=lines.length*6+5;}
    if(attendance){y+=6;doc.setFont('times','bold');doc.text('No.',20,y);doc.text('Nama',35,y);doc.text('Jabatan',130,y);doc.setFont('times','normal');attendance.forEach((person,i)=>{y+=8;doc.text(String(i+1),20,y);doc.text(person.nama,35,y);doc.text(person.jabatan||'-',130,y);});}
    return visitWorkflow.saveFile({name:title+'.pdf',data:'data:application/pdf;base64,'+Buffer.from(doc.output('arraybuffer')).toString('base64')},'surat');
  }
  if(options.deploymentPreview)require('./deployment-fixtures').seedDeploymentPreview({visitors,meetings,sppd,visitWorkflow,destinations,previewDocument,previewPhoto:()=>visitWorkflow.saveFile({name:'Dokumentasi Rapat.png',data:'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'previews/meeting-preview.png')).toString('base64')},'foto-rapat'),rooms:normalizeMeetingRooms(masterData.ruangan)});
  else {
  visitors.filter(v=>v.tipe_tamu==='luar_daerah').forEach(v=>{
    v.surat_kunjungan_file=previewDocument('Surat Permohonan Kunjungan',v).url;
    v.surat_tugas_file=previewDocument('Surat Tugas Rombongan',v).url;
  });
  sppd.slice(1).forEach(control=>{
    const v=visitors.find(v=>v.kode_kunjungan===control.kode_kunjungan);
    control.file_foto=previewDocument('Dokumentasi Kegiatan',v).url;
    control.file_absen=previewDocument('Daftar Hadir Kunjungan',v).url;
    control.file_notulen=previewDocument('Catatan Kegiatan',v).url;
    if(v.status_kunjungan==='Selesai')control.file_pengesahan=previewDocument('Surat Pengesahan SPPD',v).url;
  });
  }

  function getStats() {
    return {
      totalTamu: visitors.length,
      tamuHariIni: visitors.filter(item => item.tanggal_kunjungan === jakartaDate(currentTime())).length,
      tamuLuar: visitors.filter(item => item.tipe_tamu === 'luar_daerah').length,
      tamuFo: visitors.filter(item => item.tipe_tamu === 'dalam_daerah_fo').length,
      rapatHariIni: meetings.filter(item => item.tanggal === jakartaDate(currentTime())).length,
      sppd: {
        total: sppd.length,
        belumLengkap: sppd.filter(item => item.status_sppd === 'Belum Lengkap').length,
        sah: sppd.filter(item => item.status_sppd === 'Sah & Terverifikasi').length
      }
    };
  }

  function getLoForBidang(tujuanBidang) {
    return masterData.pegawai.find(item => item.bidang === tujuanBidang) || {
      id: '',
      nama: 'Penerima Belum Ditentukan'
    };
  }

  function nextVisitCode(prefix, visitDate) {
    const compactDate = String(visitDate).replaceAll('-', '');
    const formattedDate = `${compactDate.slice(6, 8)}${compactDate.slice(4, 6)}${compactDate.slice(0, 4)}`;
    const monthKey = formattedDate.slice(2);
    let maxSerial = 0;

    visitors.forEach(item => {
      const match = /^(?:TLD|TDD)-(\d{8})-(\d+)$/.exec(item.kode_kunjungan || '');
      if (match && match[1].slice(2) === monthKey) {
        maxSerial = Math.max(maxSerial, Number.parseInt(match[2], 10));
      }
    });

    return `${prefix}-${formattedDate}-${String(maxSerial + 1).padStart(3, '0')}`;
  }

  function registerVisitor(functionName, payload) {
    const isFo = functionName === 'registerTamuFo';
    let destination;
    try { destination = isFo ? prepareTddVisit(payload) : prepareVisit(payload); }
    catch (error) { return { success: false, error: error.message }; }
    const submittedAt = currentTime();
    const visitDate = isFo ? jakartaDate(submittedAt) : payload.tanggal_kunjungan;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate || '') ||
        Number.isNaN(Date.parse(visitDate)) ||
        new Date(visitDate).toISOString().slice(0, 10) !== visitDate) {
      return { success: false, error: 'Tanggal kunjungan tidak valid.' };
    }
    const lo = { id: destination.picIds, nama: destination.pic };
    const visitor = {
      id: Math.max(...visitors.map(item => item.id)) + 1,
      kode_kunjungan: nextVisitCode(isFo ? 'TDD' : 'TLD', visitDate),
      tipe_tamu: isFo ? 'dalam_daerah_fo' : 'luar_daerah',
      instansi: payload.instansi || (isFo ? 'Perorangan' : ''),
      alamat: payload.alamat || '',
      jumlah_orang: Number.parseInt(payload.jumlah_orang, 10) || 1,
      ketua_nama: payload.ketua_nama || '',
      pengikut_list: isFo ? '' : (payload.pengikut_list || ''),
      tujuan_bidang: destination.bidang,
      keperluan: payload.keperluan || '',
      narahubung_nama: payload.ketua_nama || '',
      narahubung_hp: payload.narahubung_hp || '',
      tanggal_kunjungan: visitDate,
      jam_kunjungan: isFo ? jakartaTime(submittedAt) : (payload.jam_kunjungan || ''),
      surat_kunjungan_file: isFo ? '' : visitWorkflow.saveFile({name:'Surat Kunjungan.pdf',data:payload.surat_kunjungan_base64}, 'surat').url,
      surat_tugas_file: isFo ? '' : visitWorkflow.saveFile({name:'Surat Tugas.pdf',data:payload.surat_tugas_base64}, 'surat').url,
      lo_id: lo.id,
      lo_nama: lo.nama,
      bawa_sppd: !isFo,
      status_kunjungan: isFo ? 'Non-SPPD' : 'Menunggu Konfirmasi'
    };

    visitors.unshift(visitor);
    if (!isFo) sppd.push({id:Math.max(0,...sppd.map(item=>item.id))+1,tamu_id:visitor.id,kode_kunjungan:visitor.kode_kunjungan,
      instansi:visitor.instansi,ketua_nama:visitor.ketua_nama,file_foto:'',file_absen:'',file_notulen:'',status_sppd:'Belum Lengkap'});
    return {
      success: true,
      message: 'Data tamu disimpan sementara di server lokal.',
      data: {
        kode_kunjungan: visitor.kode_kunjungan,
        tujuan_bidang: visitor.tujuan_bidang,
        lo_nama: visitor.lo_nama
      }
    };
  }

  return {
    responses: {
      get getDashboardData() {
        return {
          success: true,
          data: {
            stats: getStats(),
            recentTamu: visitors.slice(0, 5),
            todayMeetings: meetings.filter(item => item.tanggal === jakartaDate(currentTime())),
            loStats: []
          }
        };
      },
      get getTamuList() { return { success: true, data: visitors }; },
      getRapatCalendar: { success: true, data: meetings },
      getSppdList: { success: true, data: sppd },
      getMasterData: { success: true, data: { ...masterData, ruangan: normalizeMeetingRooms(masterData.ruangan) } },
      getMeetingRoomOptions: { success: true, data: { ruangan: normalizeMeetingRooms(masterData.ruangan) } }
    },
    getDocument: visitWorkflow.getDocument,
    handleMutation(functionName, payload = {}) {
      const workflowResponse = visitWorkflow.handle(functionName, payload);
      if (workflowResponse) return workflowResponse;
      if (functionName === 'registerTamuFo' || functionName === 'registerTamuLuar') {
        return registerVisitor(functionName, payload);
      }
      return null;
    }
  };
}

module.exports = { createFixtureStore };
