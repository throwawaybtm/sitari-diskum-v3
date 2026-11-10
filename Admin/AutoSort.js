/**
 * SI-TAMU DISKUM KOTA BATAM - GOOGLE APPS SCRIPT
 * File: AutoSort.gs
 * Fungsi: Logika Pengurutan Otomatis (Auto-Sort) untuk Google Sheets
 */

/**
 * Trigger Otomatis onEdit(e) bawaan Google Sheets
 * Terpicu otomatis setiap kali ada perubahan/penambahan baris data di Google Sheets
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const ss = sheet.getParent();

  if (sheetName === "Data_Tamu") {
    autoSortTamu(ss);
  } else if (sheetName === "Data_Rapat") {
    autoSortRapat(ss);
  } else if (sheetName === "Kendali_SPPD") {
    autoSortSppd(ss);
  } else if (sheetName === "Data_Presensi") {
    autoSortPresensi(ss);
  }
}

/**
 * Jalankan pengurutan otomatis untuk seluruh lembar kerja
 */
function autoSortAllSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  autoSortTamu(ss);
  autoSortRapat(ss);
  autoSortSppd(ss);
  autoSortPresensi(ss);
  Logger.log("✅ Seluruh Sheet telah di-sort secara otomatis.");
}

/**
 * Auto-sort Data_Tamu:
 * Diurutkan berdasarkan Tanggal Kunjungan terbaru (DESC) lalu Jam Kunjungan (DESC)
 */
function autoSortTamu(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Data_Tamu");
  if (!sheet || sheet.getLastRow() <= 2) return;

  // Baris 2 sampai baris terakhir
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);

  // Kolom 13: Tanggal_Kunjungan, Kolom 14: Jam_Kunjungan
  range.sort([
    { column: 13, ascending: false },
    { column: 14, ascending: false }
  ]);
  Logger.log("Sheet Data_Tamu di-sort otomatis (Tanggal Kunjungan Terbaru)");
}

/**
 * Auto-sort Data_Rapat:
 * Diurutkan berdasarkan Tanggal Rapat (DESC) dan Jam Mulai (DESC) agar jadwal rapat terbaru muncul teratas
 */
function autoSortRapat(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Data_Rapat");
  if (!sheet || sheet.getLastRow() <= 2) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);

  // Kolom 6: Tanggal, Kolom 7: Jam_Mulai
  range.sort([
    { column: 6, ascending: false },
    { column: 7, ascending: false }
  ]);
  Logger.log("Sheet Data_Rapat di-sort otomatis (Jadwal Rapat Terbaru)");
}

/**
 * Auto-sort Kendali_SPPD:
 * Diurutkan berdasarkan Status SPPD (Kolom 9) sehingga yang butuh perhatian/validasi muncul di urutan atas
 */
function autoSortSppd(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Kendali_SPPD");
  if (!sheet || sheet.getLastRow() <= 2) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);

  // Kolom 9: Status_SPPD (ASC agar 'Belum Lengkap' & 'Menunggu...' berada di atas)
  range.sort([
    { column: 9, ascending: true },
    { column: 1, ascending: false } // SPPD_ID terbaru
  ]);
  Logger.log("Sheet Kendali_SPPD di-sort otomatis (Status Prioritas)");
}

/**
 * Auto-sort Data_Presensi:
 * Diurutkan berdasarkan Waktu Hadir (Kolom 10) DESC
 */
function autoSortPresensi(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Data_Presensi");
  if (!sheet || sheet.getLastRow() <= 2) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);

  // Kolom 10: Waktu_Hadir DESC
  range.sort([
    { column: 10, ascending: false }
  ]);
  Logger.log("Sheet Data_Presensi di-sort otomatis (Presensi Terkini)");
}
