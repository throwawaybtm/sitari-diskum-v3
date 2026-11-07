/**
 * SI-TAMU FRONT OFFICE
 * Public, write-only intake app connected to the shared SI-TAMU spreadsheet.
 */

const SHARED_DATABASE_NAME = 'DB_SI_TAMU_DISKUM_BATAM';

function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.tddDestinations = getTddPublicDestinations_();
  return template.evaluate()
    .setTitle('Pendaftaran Kunjungan Tamu Dalam Daerah')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSharedSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = props.getProperty('SPREADSHEET_ID');

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (error) {
      throw new Error('SPREADSHEET_ID tidak valid atau tidak dapat diakses oleh project Tamu FO.');
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

function assignLiaisonOfficer_(ss, tujuanBidang) {
  const sheet = ss.getSheetByName('Master_Pegawai');
  if (!sheet || sheet.getLastRow() <= 1) return { id: null, nama: 'Petugas FO' };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let targetBidang = 'Koperasi';
  if (tujuanBidang && tujuanBidang.toLowerCase().indexOf('mikro') > -1) {
    targetBidang = 'Usaha Mikro';
  }

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

function registerTamuFo(payload) {
  const destination = prepareTddVisit_(payload);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSharedSpreadsheet_();
    const sheetTamu = ss.getSheetByName('Data_Tamu');
    if (!sheetTamu) throw new Error('Sheet Data_Tamu tidak ditemukan pada database bersama.');

    const nextId = sheetTamu.getLastRow();
    const submittedAt = new Date();
    const today = Utilities.formatDate(submittedAt, 'Asia/Jakarta', 'yyyy-MM-dd');
    const nowHours = Utilities.formatDate(submittedAt, 'Asia/Jakarta', 'HH:mm');
    const kodeKunjungan = generateVisitCode_(sheetTamu, 'TDD', today);
    const timeNow = Utilities.formatDate(submittedAt, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

    sheetTamu.appendRow([
      nextId, kodeKunjungan, 'dalam_daerah_fo', payload.instansi || 'Perorangan', payload.alamat || '',
      Number(payload.jumlah_orang), payload.ketua_nama, '',
      destination.bidang, payload.keperluan, payload.ketua_nama, payload.narahubung_hp,
      today, nowHours, '', '', destination.picIds, destination.pic, 0, 'Diterima', timeNow
    ]);

    sortTamu_(ss);
    return {
      success: true,
      message: 'Pendaftaran kunjungan berhasil.',
      data: { kode_kunjungan: kodeKunjungan, lo_nama: destination.pic, tujuan_bidang: destination.bidang }
    };
  } finally {
    lock.releaseLock();
  }
}
