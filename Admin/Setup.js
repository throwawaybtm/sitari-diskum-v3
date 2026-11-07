/**
 * SI-TAMU DISKUM KOTA BATAM
 * Helper inisialisasi struktur database dan folder Google Drive.
 * File ini tidak membuat atau mengisi data sampel.
 */

const FOLDER_ROOT_NAME = "SI-TAMU DISKUM KOTA BATAM";
const FOLDER_SURAT_NAME = "1. Surat Tamu (Kunjungan & Tugas)";
const FOLDER_BUKTI_NAME = "2. Bukti Kegiatan SPPD (Foto, Absen, Notulen)";

function setupGoogleDriveFolders() {
  let rootFolder;
  const rootIter = DriveApp.getFoldersByName(FOLDER_ROOT_NAME);
  if (rootIter.hasNext()) {
    rootFolder = rootIter.next();
  } else {
    rootFolder = DriveApp.createFolder(FOLDER_ROOT_NAME);
  }

  let suratFolder;
  const suratIter = rootFolder.getFoldersByName(FOLDER_SURAT_NAME);
  if (suratIter.hasNext()) {
    suratFolder = suratIter.next();
  } else {
    suratFolder = rootFolder.createFolder(FOLDER_SURAT_NAME);
  }

  let buktiFolder;
  const buktiIter = rootFolder.getFoldersByName(FOLDER_BUKTI_NAME);
  if (buktiIter.hasNext()) {
    buktiFolder = buktiIter.next();
  } else {
    buktiFolder = rootFolder.createFolder(FOLDER_BUKTI_NAME);
  }

  return {
    rootId: rootFolder.getId(),
    suratId: suratFolder.getId(),
    buktiId: buktiFolder.getId()
  };
}

function formatHeader(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setBackground("#065F46");
  range.setFontColor("#FFFFFF");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  range.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);

  try {
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  } catch (e) {}
}

function setupSheetMasterPegawai(ss) {
  let sheet = ss.getSheetByName("Master_Pegawai");
  if (!sheet) sheet = ss.insertSheet("Master_Pegawai");
  formatHeader(sheet, ["ID", "NIP", "Nama Pegawai", "Jabatan", "Bidang", "Is_LO", "Workload_Count", "Status_Aktif"]);
}

function setupSheetMasterOPD(ss) {
  let sheet = ss.getSheetByName("Master_OPD");
  if (!sheet) sheet = ss.insertSheet("Master_OPD");
  formatHeader(sheet, ["ID", "Nama OPD Pemko Batam", "Kategori"]);
}

function setupSheetMasterRuangan(ss) {
  let sheet = ss.getSheetByName("Master_Ruangan");
  if (!sheet) sheet = ss.insertSheet("Master_Ruangan");
  formatHeader(sheet, ["ID", "Nama Ruangan", "Kapasitas", "Fasilitas", "Lokasi", "Warna_Hex"]);
}

function setupSheetDataTamu(ss) {
  let sheet = ss.getSheetByName("Data_Tamu");
  if (!sheet) sheet = ss.insertSheet("Data_Tamu");
  formatHeader(sheet, [
    "ID", "Kode_Kunjungan", "Tipe_Tamu", "Instansi", "Alamat", "Jumlah_Orang",
    "Ketua_Nama", "Pengikut_List", "Tujuan_Bidang", "Keperluan",
    "Narahubung_Nama", "Narahubung_HP", "Tanggal_Kunjungan", "Jam_Kunjungan",
    "URL_Surat_Kunjungan", "URL_Surat_Tugas", "LO_ID", "LO_Nama", "Bawa_SPPD",
    "Status_Kunjungan", "Timestamp"
  ]);
}

function setupSheetDataRapat(ss) {
  let sheet = ss.getSheetByName("Data_Rapat");
  if (!sheet) sheet = ss.insertSheet("Data_Rapat");
  formatHeader(sheet, [
    "ID", "Kode_Rapat", "Judul_Rapat", "Ruangan_ID", "Nama_Ruangan",
    "Tanggal", "Jam_Mulai", "Jam_Selesai", "Bidang_Penyelenggara",
    "Pimpinan_Rapat", "Jumlah_Peserta", "Agenda", "Status", "Timestamp"
  ]);
}

function setupSheetDataPresensi(ss) {
  let sheet = ss.getSheetByName("Data_Presensi");
  if (!sheet) sheet = ss.insertSheet("Data_Presensi");
  formatHeader(sheet, [
    "ID", "Rapat_ID", "Judul_Rapat", "Kategori_Peserta", "Nama_Peserta",
    "NIP", "Jabatan", "Nama_OPD_Bidang", "No_HP", "Waktu_Hadir",
    "Anggota Kunjungan ID", "Sumber Presensi", "Waktu Pencatatan"
  ]);
}

function setupSheetKendaliSPPD(ss) {
  let sheet = ss.getSheetByName("Kendali_SPPD");
  if (!sheet) sheet = ss.insertSheet("Kendali_SPPD");
  formatHeader(sheet, [
    "SPPD_ID", "Tamu_ID", "Kode_Kunjungan", "Instansi", "Ketua_Nama",
    "URL_Foto", "URL_Absen", "URL_Notulen", "Status_SPPD",
    "TTD_Teknis_Status", "TTD_Teknis_Nama", "TTD_Teknis_Waktu",
    "TTD_Kasubag_Status", "TTD_Kasubag_Nama", "TTD_Kasubag_Waktu",
    "Catatan", "Timestamp"
  ]);
}
