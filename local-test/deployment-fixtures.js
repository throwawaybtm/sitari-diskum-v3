'use strict';
const {buildTwentyDemoData_}=require('./deployment-demo-builder');
const snapshot=require('./deployment-fixture-version.json');
function seedDeploymentPreview({visitors,meetings,sppd,visitWorkflow,destinations,previewDocument,previewPhoto,rooms}){
  visitors.length=0;meetings.length=0;sppd.length=0;
  const data=buildTwentyDemoData_({...snapshot,actor:'Admin',rooms,directory:destinations.map((d,i)=>({...d,id:String(i+1)})),document:previewDocument,photo:previewPhoto});
  data.Data_Tamu.forEach(r=>visitors.push({id:r[0],kode_kunjungan:r[1],tipe_tamu:r[2],instansi:r[3],alamat:r[4],jumlah_orang:r[5],ketua_nama:r[6],pengikut_list:r[7],tujuan_bidang:r[8],keperluan:r[9],narahubung_nama:r[10],narahubung_hp:r[11],tanggal_kunjungan:r[12],jam_kunjungan:r[13],surat_kunjungan_file:r[14],surat_tugas_file:r[15],lo_id:r[16],lo_nama:r[17],bawa_sppd:r[18],status_kunjungan:r[19]}));
  data.Data_Rapat.forEach(r=>meetings.push({id:r[0],kode_rapat:r[1],kode_kunjungan:r[1].startsWith('VISIT-')?r[1].slice(6):'',judul_rapat:r[2],ruangan_id:r[3],nama_ruangan:r[4],tanggal:r[5],jam_mulai:r[6],jam_selesai:r[7],penyelenggara_bidang:r[8],pimpinan_rapat:r[9],jumlah_peserta:r[10],agenda:r[11],status:r[12]}));
  data.Kendali_SPPD.forEach(r=>sppd.push({id:r[0],tamu_id:r[1],kode_kunjungan:r[2],instansi:r[3],ketua_nama:r[4],file_foto:r[5],file_absen:r[6],file_notulen:r[7],status_sppd:r[8]}));
  data.Alur_Kunjungan.forEach(r=>{const v=visitors.find(v=>v.kode_kunjungan===r[0]),state=JSON.parse(r[2]);const attendance=data.Data_Presensi.filter(a=>state.booking&&a[1]===state.booking.id).map(a=>({rapat_id:a[1],nama:a[4],jabatan:a[6],nama_opd:a[7],waktu:a[9],member_id:a[10],source:a[11]}));visitWorkflow.seedVisit(v,state,attendance);});
  data.Foto_Agenda.forEach(r=>{const meeting=meetings.find(m=>String(m.id)===String(r[0]));if(meeting)meeting.photos=JSON.parse(r[1]);});
  data.Data_Rapat.filter(r=>!r[1].startsWith('VISIT-')).forEach(r=>visitWorkflow.seedAgendaAttendance(r[0],data.Data_Presensi.filter(a=>String(a[1])===String(r[0])).map(a=>({rapat_id:a[1],nama:a[4],jabatan:a[6],waktu:a[9],source:a[11]}))));
  data.Dokumen_Agenda.forEach(r=>visitWorkflow.seedAgendaNotula(r[0],JSON.parse(r[1])));
}
module.exports={seedDeploymentPreview};
