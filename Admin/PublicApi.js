/** Narrow library API for the public attendance app. No workflow files or PIC contacts. */
function getPublicEmployeeCount(){return DISKUM_EMPLOYEE_DIRECTORY.length;}
function getPublicAttendanceMasterData(){
  const result=getMasterData();
  if(!result||!result.success)return result;
  return {success:true,data:{pegawai:result.data.pegawai.map(p=>({id:p.id,nip:p.nip,nama:p.nama,jabatan:p.jabatan,bidang:p.bidang})),opd:result.data.opd.map(o=>({id:o.id,nama_opd:o.nama_opd}))}};
}
function getPublicAttendanceCalendar(){
  const result=getRapatCalendar();
  if(!result||!result.success)return result;
  return {success:true,data:result.data.map(m=>({id:m.id,kode_rapat:m.kode_rapat,kode_kunjungan:m.kode_kunjungan,judul_rapat:m.judul_rapat,nama_ruangan:m.nama_ruangan,tanggal:m.tanggal,jam_mulai:m.jam_mulai,jam_selesai:m.jam_selesai,status:m.status,locked:Boolean(m.locked),notula:Boolean(m.notula),manual_attendance:Boolean(m.manual_attendance)}))};
}
