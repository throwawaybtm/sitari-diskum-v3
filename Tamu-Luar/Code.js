/**
 * SI-TAMU TAMU LUAR
 * Public, write-only intake app connected to the shared SI-TAMU spreadsheet and Drive folders.
 */

const SHARED_DATABASE_NAME = 'DB_SI_TAMU_DISKUM_BATAM';
const FOLDER_ROOT_NAME = 'SI-TAMU DISKUM KOTA BATAM';
const FOLDER_SURAT_NAME = '1. Surat Tamu (Kunjungan & Tugas)';

function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.tldDestinations = getTldPublicDestinations_();
  return template.evaluate()
    .setTitle('Pendaftaran Kunjungan Tamu Luar Daerah')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSharedSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = props.getProperty('SPREADSHEET_ID');

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (error) {
      throw new Error('SPREADSHEET_ID tidak valid atau tidak dapat diakses oleh project Tamu Luar.');
    }
  }

  const files = DriveApp.getFilesByName(SHARED_DATABASE_NAME);
  const spreadsheetIds = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) spreadsheetIds.push(file.getId());
  }

  if (spreadsheetIds.length === 0) {
    throw new Error('Database bersama tidak ditemukan. Atur Script Property SPREADSHEET_ID sebelum menggunakan form.');
  }
  if (spreadsheetIds.length > 1) {
    throw new Error('Ditemukan lebih dari satu database dengan nama yang sama. Atur Script Property SPREADSHEET_ID secara manual.');
  }

  props.setProperty('SPREADSHEET_ID', spreadsheetIds[0]);
  return SpreadsheetApp.openById(spreadsheetIds[0]);
}

function getSuratFolder_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = props.getProperty('FOLDER_SURAT_ID');
  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (error) {
      throw new Error('FOLDER_SURAT_ID tidak valid atau tidak dapat diakses oleh project Tamu Luar.');
    }
  }

  const rootIterator = DriveApp.getFoldersByName(FOLDER_ROOT_NAME);
  const rootFolder = rootIterator.hasNext() ? rootIterator.next() : DriveApp.createFolder(FOLDER_ROOT_NAME);
  const suratIterator = rootFolder.getFoldersByName(FOLDER_SURAT_NAME);
  const suratFolder = suratIterator.hasNext() ? suratIterator.next() : rootFolder.createFolder(FOLDER_SURAT_NAME);
  props.setProperty('FOLDER_SURAT_ID', suratFolder.getId());
  return suratFolder;
}

function saveBase64ToDrive_(base64Data, fileName, fallbackMimeType, createdFiles) {
  if (!base64Data) return '';
  validateTldUpload_(base64Data);
  const match = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : fallbackMimeType;
  const cleanBase64 = match ? match[2] : base64Data;
  const blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), mimeType || 'application/octet-stream', fileName);
  const file = getSuratFolder_().createFile(blob);
  if (createdFiles) createdFiles.push(file);
  return file.getUrl();
}

function assignLiaisonOfficer_(ss, tujuanBidang) {
  const sheet = ss.getSheetByName('Master_Pegawai');
  if (!sheet || sheet.getLastRow() <= 1) return { id: null, nama: 'Petugas FO' };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let targetBidang = 'Koperasi';
  if (tujuanBidang && tujuanBidang.toLowerCase().indexOf('mikro') > -1) targetBidang = 'Usaha Mikro';

  let candidates = data.filter(row => row[4] === targetBidang && row[5] == 1 && row[7] === 'Aktif');
  if (candidates.length === 0) candidates = data.filter(row => row[5] == 1 && row[7] === 'Aktif');
  if (candidates.length === 0) return { id: null, nama: 'Petugas Piket FO', jabatan: 'Staf Penerima' };

  candidates.sort((a, b) => Number(a[6]) - Number(b[6]));
  const chosen = candidates[0];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == chosen[0]) {
      sheet.getRange(i + 2, 7).setValue(Number(chosen[6]) + 1);
      break;
    }
  }

  return { id: chosen[0], nama: chosen[2], jabatan: chosen[3], bidang: chosen[4], nip: chosen[1] };
}

function sortTamu_(ss) {
  const sheet = ss.getSheetByName('Data_Tamu');
  if (!sheet || sheet.getLastRow() <= 2) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).sort([
    { column: 13, ascending: false },
    { column: 14, ascending: false }
  ]);
}

function sortSppd_(ss) {
  const sheet = ss.getSheetByName('Kendali_SPPD');
  if (!sheet || sheet.getLastRow() <= 2) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).sort([
    { column: 9, ascending: true },
    { column: 1, ascending: false }
  ]);
}

function buildVisitCode_(prefix, dateValue, existingCodes) {
  if (prefix !== 'TLD' && prefix !== 'TDD') {
    throw new Error('Visit code prefix must be TLD or TDD.');
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  if (!dateMatch) throw new Error('Visit date must use yyyy-MM-dd format.');

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Visit date is not a valid calendar date.');
  }

  const compactDate = `${dateMatch[3]}${dateMatch[2]}${dateMatch[1]}`;
  const monthKey = `${dateMatch[2]}${dateMatch[1]}`;
  let highestSerial = 0;

  (Array.isArray(existingCodes) ? existingCodes : []).forEach(code => {
    const codeMatch = /^(TLD|TDD)-(\d{2})(\d{2})(\d{4})-(\d+)$/.exec(String(code || '').trim());
    if (!codeMatch || `${codeMatch[3]}${codeMatch[4]}` !== monthKey) return;
    highestSerial = Math.max(highestSerial, Number(codeMatch[5]));
  });

  return `${prefix}-${compactDate}-${String(highestSerial + 1).padStart(3, '0')}`;
}

function generateVisitCode_(sheet, prefix, dateValue) {
  const lastRow = sheet.getLastRow();
  const existingCodes = lastRow > 1
    ? sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues().map(row => row[0])
    : [];
  return buildVisitCode_(prefix, dateValue, existingCodes);
}

function includeOrganizationStructure_() {
  return HtmlService.createHtmlOutputFromFile('OrganizationStructure').getContent();
}

/** Return max numeric ID in column A plus one so gaps, sorting, or deletions cannot reuse IDs. */
function nextRecordId_(sheet) {
  const lastRow = sheet && typeof sheet.getLastRow === 'function' ? sheet.getLastRow() : 0;
  if (lastRow <= 1) return 1;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return values.reduce((max, row) => {
    const raw = row && row[0];
    if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') return max;
    const numeric = typeof raw === 'string' && !raw.trim() ? NaN : Number(raw);
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0) + 1;
}

function normalizeTldUploads_(value, required) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  if (required && !list.length) throw new Error('Pilih minimal satu dokumen pada setiap kolom unggahan.');
  if (list.some(item => typeof item !== 'string' || !item.trim())) throw new Error('Dokumen unggahan tidak valid.');
  return list;
}
function validateTldDocumentBatch_(payload) {
  validateTldRequiredFields_(payload);
  const kunjungan = normalizeTldUploads_(payload.surat_kunjungan_base64, true);
  const tugas = normalizeTldUploads_(payload.surat_tugas_base64, true);
  kunjungan.concat(tugas).forEach(data => validateTldUpload_(data));
  return Object.assign({}, payload, { surat_kunjungan_base64: kunjungan[0], surat_tugas_base64: tugas[0] });
}

function saveTldDocuments_(value, fileName, createdFiles) {
  const documents = normalizeTldUploads_(value, true);
  const urls = documents.map((data, index) => saveBase64ToDrive_(data,
    documents.length === 1 ? fileName : fileName + '_' + (index + 1), 'application/pdf', createdFiles));
  return urls.length === 1 ? urls[0] : JSON.stringify(urls);
}

function registerTamuLuar(payload) {
  const destination = prepareTldVisit_(validateTldDocumentBatch_(payload));

  const createdFiles = [];
  let rowWritten = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSharedSpreadsheet_();
    const sheetTamu = ss.getSheetByName('Data_Tamu');
    if (!sheetTamu) throw new Error('Sheet Data_Tamu tidak ditemukan pada database bersama.');

    const nextId = nextRecordId_(sheetTamu);
    const dateValue = payload.tanggal_kunjungan || Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const kodeKunjungan = generateVisitCode_(sheetTamu, 'TLD', dateValue);
    const timeNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    // Every TLD registration follows the admin approval/SPPD workflow.
    const isBawaSppd = 1;

    const urlSuratKunjungan = saveTldDocuments_(payload.surat_kunjungan_base64, `Surat_Kunjungan_${kodeKunjungan}`, createdFiles);
    const urlSuratTugas = saveTldDocuments_(payload.surat_tugas_base64, `Surat_Tugas_${kodeKunjungan}`, createdFiles);

    sheetTamu.getRange(sheetTamu.getLastRow() + 1, 13, 1, 2).setNumberFormat('@');
    sheetTamu.appendRow([
      nextId, kodeKunjungan, 'luar_daerah', payload.instansi, payload.alamat || '',
      Number(payload.jumlah_orang) || 1, payload.ketua_nama, payload.pengikut_list || '',
      destination.bidang, payload.keperluan, payload.narahubung_nama || payload.ketua_nama,
      payload.narahubung_hp, dateValue, payload.jam_kunjungan || '09:00',
      urlSuratKunjungan, urlSuratTugas, destination.picIds, destination.pic, isBawaSppd, 'Menunggu Konfirmasi', timeNow
    ]);
    rowWritten = true;

    if (isBawaSppd) {
      const sheetSppd = ss.getSheetByName('Kendali_SPPD');
      if (sheetSppd) {
        const sppdId = nextRecordId_(sheetSppd);
        sheetSppd.appendRow([
          sppdId, nextId, kodeKunjungan, payload.instansi, payload.ketua_nama,
          '', '', '', 'Belum Lengkap', 'Belum TTD', '-', '-', 'Belum TTD', '-', '-',
          'Pendaftaran tamu luar daerah. Menunggu pelaksanaan dan kelengkapan bukti.', timeNow
        ]);
        sortSppd_(ss);
      }
    }

    sortTamu_(ss);
    return {
      success: true,
      message: 'Pendaftaran kunjungan berhasil.',
      data: {
        kode_kunjungan: kodeKunjungan,
        lo_nama: destination.pic,
        lo_jabatan: 'PIC Bidang Tujuan',
        tujuan_bidang: destination.bidang
      }
    };
  } catch (error) {
    if (!rowWritten) createdFiles.forEach(file => {
      try { file.setTrashed(true); } catch (cleanupError) { /* Preserve the original error. */ }
    });
    throw error;
  } finally {
    try {
      if (typeof SpreadsheetApp !== 'undefined' && typeof SpreadsheetApp.flush === 'function') {
        SpreadsheetApp.flush();
      }
    } finally {
      lock.releaseLock();
    }
  }
}
