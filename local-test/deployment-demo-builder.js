/** Pure demo-data builder; documents are provided by the execution adapter. */
function buildTwentyDemoData_(env) {
  const specs=[
    ['Dinas Koperasi Kabupaten Purnama','Jl. Meranti No. 12, Purnama','Arif Wicaksono, S.E.',null,'Menunggu Konfirmasi',1],
    ['Komunitas Usaha Cempaka Batam','Jl. Cempaka No. 8, Batam Centre','Nadia Putri',5,'Non-SPPD',0],
    ['Dinas Koperasi Kota Lestari','Jl. Kenanga No. 25, Lestari','Bram Prasetya, S.Sos.',3,'Sudah Disposisi',1],
    ['Koperasi Cahaya Bersama','Jl. Melati No. 16, Sekupang','Maya Larasati',4,'Non-SPPD',0],
    ['Dinas Koperasi Kabupaten Samudra','Jl. Samudra No. 5, Samudra','Dimas Saputra, S.E.',1,'Menunggu Kedatangan',1],
    ['Dinas Koperasi Kota Wana Asri','Jl. Angsana No. 19, Wana Asri','Ratih Kusumawati, S.E.',2,'Kelola SPPD',-1],
    ['Paguyuban Wirausaha Pelita','Jl. Bakau No. 11, Bengkong','Fajar Maulana',6,'Non-SPPD',0],
    ['Dinas Koperasi Kabupaten Citra Buana','Jl. Palem No. 31, Citra Buana','Surya Adinata, M.M.',7,'Selesai',-2],
    ['Dinas Koperasi Kota Bintang Raya','Jl. Tanjung No. 14, Bintang Raya','Hana Kartika, S.E.',null,'Menunggu Konfirmasi',2],
    ['Kelompok Usaha Seroja Batam','Jl. Seroja No. 9, Batu Aji','Reno Hidayat',5,'Non-SPPD',0],
    ['Dinas Koperasi Kabupaten Tirta Jaya','Jl. Tirta No. 20, Tirta Jaya','Indra Permana, S.E.',0,'Menunggu Konfirmasi',2],
    ['Forum Pelaku Usaha Pesisir','Jl. Pesisir No. 4, Nongsa','Laila Maharani',0,'Non-SPPD',0],
    ['Dinas Koperasi Kota Mandala','Jl. Mandala No. 7, Mandala','Rama Kusnadi, S.Kom.',4,'Sudah Disposisi',2],
    ['Koperasi Harapan Mandiri','Jl. Flamboyan No. 18, Sagulung','Dewi Anggraini',3,'Non-SPPD',-1],
    ['Dinas Koperasi Kabupaten Mutiara','Jl. Mutiara No. 6, Mutiara','Yusuf Firmansyah, S.E.',5,'Menunggu Kedatangan',1],
    ['Dinas Koperasi Kota Bukit Sari','Jl. Sari No. 15, Bukit Sari','Sinta Puspitasari, S.E.',6,'Kelola SPPD',-2],
    ['Komunitas Pengrajin Anyelir','Jl. Anyelir No. 22, Lubuk Baja','Galih Pradana',7,'Non-SPPD',0],
    ['Dinas Koperasi Kabupaten Bina Karya','Jl. Karya No. 28, Bina Karya','Wulan Saraswati, M.M.',8,'Selesai',-3],
    ['Dinas Koperasi Kota Nusa Bakti','Jl. Nusa No. 13, Nusa Bakti','Teguh Pamungkas, S.E.',null,'Menunggu Konfirmasi',3],
    ['Kelompok UMKM Tunas Batam','Jl. Tunas No. 17, Batam Kota','Alya Ramadhani',8,'Non-SPPD',0]
  ];
  const members=[['Salma Nurfadila','Rizky Pratama'],[],['Niken Ayuningtyas','Rafi Ramadhan'],[],['Citra Paramita','Rudi Hartono'],['Nadia Aprilia','Fahmi Kurnia'],[],['Lina Oktavia','Eko Wibowo'],['Dina Safitri','Ilham Maulana'],[],['Ayu Prameswari','Bayu Nugraha'],[],['Tania Rahma','Arman Pradipta'],[],['Putri Anindya','Doni Susanto'],['Intan Melati','Gilang Mahendra'],[],['Nabila Anjani','Hendra Saputra'],['Tiara Wulandari','Daffa Maulana'],[]];
  const agendas=['Koordinasi pelayanan administrasi dan tata kelola kelembagaan.','Konsultasi pemasaran produk usaha mikro.','Studi penguatan dan pemberdayaan koperasi.','Konsultasi pengawasan dan laporan koperasi.','Pembahasan perencanaan program kerja tahunan.','Koordinasi penatausahaan keuangan dan aset.','Informasi pelatihan kewirausahaan.','Kunjungan konsultasi pengembangan usaha.','Pembahasan layanan dan pendampingan usaha.','Konsultasi perizinan dan pengembangan produk.','Koordinasi pelayanan umum dan administrasi.','Konsultasi administrasi pengajuan layanan.','Pembahasan tata kelola pengawasan koperasi.','Konsultasi pembinaan kelembagaan koperasi.','Pembahasan pengembangan dan pemasaran usaha mikro.','Koordinasi kegiatan pelatihan wirausaha.','Konsultasi pendampingan usaha dan akses pasar.','Pembahasan layanan pengelolaan dana bergulir.','Koordinasi rencana kunjungan pembelajaran.','Konsultasi pembiayaan dan pengembangan usaha.'];
  const out={Data_Tamu:[],Data_Rapat:[],Data_Presensi:[],Kendali_SPPD:[],Alur_Kunjungan:[],Dokumen_Agenda:[],Foto_Agenda:[]};
  const date=offset=>new Date(Date.parse(env.today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const sequences={};
  function codeFor(prefix,day){const month=day.slice(0,7);sequences[month]=(sequences[month]||0)+1;return prefix+'-'+day.split('-').reverse().join('')+'-'+String(sequences[month]).padStart(3,'0');}
  specs.forEach(([instansi,alamat,name,di,status,offset],index)=>{
    const tld=status!=='Non-SPPD',d=di===null?null:env.directory[di],day=date(offset);
    const v={id:index+1,kode_kunjungan:codeFor(tld?'TLD':'TDD',day),tipe_tamu:tld?'luar_daerah':'dalam_daerah_fo',instansi,alamat,ketua_nama:name,jumlah_orang:tld?3:index%3+1,pengikut_list:members[index].join('\n'),tujuan_bidang:d?d.bidang:'',keperluan:agendas[index],narahubung_nama:name,narahubung_hp:'080000002'+String(index+1).padStart(3,'0'),tanggal_kunjungan:day,jam_kunjungan:index>=10?'13:00':'09:00',lo_nama:d?d.pic:'',status_kunjungan:status};
    const originals=tld?[env.document('Surat Permohonan Kunjungan',v),env.document('Surat Tugas Rombongan',v)]:[];
    out.Data_Tamu.push([v.id,v.kode_kunjungan,v.tipe_tamu,instansi,alamat,v.jumlah_orang,name,v.pengikut_list,v.tujuan_bidang,v.keperluan,name,v.narahubung_hp,day,v.jam_kunjungan,originals[0]?.url||'',originals[1]?.url||'',d?d.id:'',v.lo_nama,tld,status,env.stamp]);
    if(!tld)return;
    const step=['Menunggu Konfirmasi','Sudah Disposisi','Menunggu Kedatangan','Kelola SPPD','Selesai'].indexOf(status),mark={at:env.stamp,actor:env.actor};
    const state={version:1,status,acknowledged:step>=1?mark:null,disposisi:step>=1?env.document('Surat Disposisi',v):null,notifications:step>=2?[{pic:d.pic,success:true,simulated:true,at:env.stamp}]:[],booking:null,arrival:null,files:{},note:step===4?'Kunjungan telah selesai. Hasil pembahasan dan tindak lanjut telah dicatat.':'',history:[{at:env.stamp,actor:env.actor,action:'prepare-demo',status}]};
    if(step>=2){const room=env.rooms[index>=10?1:0],id=100+index;state.booking={id,kode_rapat:'VISIT-'+v.kode_kunjungan,kode_kunjungan:v.kode_kunjungan,judul_rapat:'Kunjungan '+instansi,ruangan_id:room.id,nama_ruangan:room.nama_ruangan,tanggal:day,jam_mulai:v.jam_kunjungan,jam_selesai:index>=10?'14:00':'10:00'};
      const b=state.booking;out.Data_Rapat.push([id,b.kode_rapat,b.judul_rapat,b.ruangan_id,b.nama_ruangan,day,b.jam_mulai,b.jam_selesai,d.bidang,d.pic,3,v.keperluan,step===4?'Selesai':'Terjadwal',env.stamp]);}
    if(step>=3){const attendees=[name,...members[index]].map((nama,i)=>({nama,jabatan:i?'Staf':'Ketua Rombongan'}));attendees.forEach((a,i)=>out.Data_Presensi.push([out.Data_Presensi.length+1,state.booking.id,state.booking.judul_rapat,'Tamu_Luar',a.nama,'-',a.jabatan,instansi,'',day+' '+v.jam_kunjungan+':00',i?'anggota-'+i:'ketua','Admin']));
      state.arrival={...mark,count:3};state.files.foto=env.document('Dokumentasi Kunjungan',v);state.files.absen=env.document('Daftar Hadir Kunjungan',v,attendees);}
    if(step===4){state.completed=mark;const notula=env.document('E-notula Kunjungan',v);out.Dokumen_Agenda.push([state.booking.id,JSON.stringify(notula),env.stamp]);}
    out.Alur_Kunjungan.push([v.kode_kunjungan,1,JSON.stringify(state),env.stamp]);
    out.Kendali_SPPD.push([out.Kendali_SPPD.length+1,v.id,v.kode_kunjungan,instansi,name,state.files.foto?.url||'',state.files.absen?.url||'','',step===4?'Sah & Terverifikasi':step===3?'Menunggu Validasi Teknis':'Belum Lengkap',step===4?1:0,step===4?d.pic:'',step===4?env.stamp:'',step===4?1:0,step===4?d.pic:'',step===4?env.stamp:'',state.note||'',env.stamp]);
  });
  const internal=['Evaluasi Program Pembinaan Koperasi','Koordinasi Pengembangan Usaha Mikro','Persiapan Pendampingan Wirausaha','Pembahasan Layanan Administrasi','Evaluasi Pendampingan Koperasi','Koordinasi Layanan Usaha Mikro'];
  internal.forEach((title,i)=>{if(i===2)return;const room=env.rooms[(i+2)%env.rooms.length],id=200+i,day=date(i===0?1:i===2?0:i===1||i===3?-1:i===4?-2:-3),start=i===2?'00:00':'13:00',end=i===2?'23:59':'14:00';
    out.Data_Rapat.push([id,'RPT-'+day.replace(/-/g,'')+'-'+String(i+1).padStart(3,'0'),title,room.id,room.nama_ruangan,day,start,end,env.directory[i].bidang,env.directory[i].pic,5,'Pembahasan kegiatan dan tindak lanjut program internal.',i===3?'Selesai':i===5?'Terlaksana':'Terjadwal',env.stamp]);
    const photoVisit={kode_kunjungan:'RPT-'+id,instansi:'Dinas Koperasi dan Usaha Mikro Kota Batam',ketua_nama:env.directory[i].pic,keperluan:title,tanggal_kunjungan:day};
    if(i>=3)out.Foto_Agenda.push([id,JSON.stringify([(env.photo||env.document)('Dokumentasi Rapat Internal',photoVisit)]),env.stamp]);
    if(i!==0&&i!==3)['Ayu Kartikasari','Bimo Santosa'].forEach(nama=>out.Data_Presensi.push([out.Data_Presensi.length+1,id,title,'Internal',nama,'-','Staf','Diskum Batam','',day+' '+(i===2?'08:00':'13:00')+':00','','QR']));
    if(i===3){const v={kode_kunjungan:'RPT-'+id,instansi:'Dinas Koperasi dan Usaha Mikro Kota Batam',ketua_nama:env.directory[i].pic,keperluan:title,tanggal_kunjungan:day};const doc=env.document('E-notula Rapat Internal',v);out.Dokumen_Agenda.push([id,JSON.stringify(doc),env.stamp]);['Ayu Kartikasari','Bimo Santosa'].forEach(nama=>out.Data_Presensi.push([out.Data_Presensi.length+1,id,title,'Internal',nama,'-','Staf','Diskum Batam','',day+' 13:00:00','','QR']));}
  });
  return out;
}


module.exports={buildTwentyDemoData_};
