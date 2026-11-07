/**
 * SI-TAMU DISKUM KOTA BATAM - GOOGLE APPS SCRIPT
 * File: Code.gs
 * Backend Controller & Web App Entry Point
 */

function doGet(e) {
  configureNewDeployment_();
  ensurePublicVisitDocuments_();
  ensurePlutMeetingRoom_();
  const employeeImport=ensureEmployeeDirectory_();
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'index';
  let template;

  const adminAttendance=page==='presensi-admin';
  if(adminAttendance)requireVisitAdmin_();
  if (page === 'presensi'||adminAttendance) {
    template = HtmlService.createTemplateFromFile('Presensi');
    template.rapatId = (e && e.parameter && e.parameter.id) ? e.parameter.id : '';
  } else {
    template = HtmlService.createTemplateFromFile('Index');
  }

  const props = PropertiesService.getScriptProperties();
  template.adminAttendance=adminAttendance;
  template.adminAppUrl=ScriptApp.getService().getUrl();
  template.appUrl = props.getProperty('PUBLIC_FORMS_BASE_URL') || ScriptApp.getService().getUrl();
  template.tamuFoUrl = props.getProperty('TAMU_FO_URL') || 'https://script.google.com/macros/s/AKfycbyWh3B1JJM6rFnM46BjjMt5r6JSeu-Yp8slnI27N31bzc1qO1zxg4rzu0-O4nunKhmNAA/exec';
  template.tamuLuarUrl = props.getProperty('TAMU_LUAR_URL') || 'https://script.google.com/macros/s/AKfycbwiqiugWQNYGKrNeFd7fJcbeABoIPvzwrCj0m1CK9412ZMgjz3kbPzMdMOckHEC9P0u/exec';
  template.meetingRooms = MEETING_ROOM_DIRECTORY;
  template.employeeImportCount=employeeImport.count;

  return template.evaluate()
    .setTitle(page === 'presensi'||adminAttendance ? 'Dashboard Presensi' : 'SI-TAMU DISKUM | Dinas Koperasi & Usaha Mikro Kota Batam')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

function formatDateVal(val) { if (!val) return ''; if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd'); return String(val).substring(0, 10); }

function formatTimeVal(val) { if (!val) return ''; if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Jakarta', 'HH:mm'); if (String(val).length >= 5) return String(val).substring(0, 5); return String(val); }

/** Read sheet-local wall time; never treat a bare 12-hour cell display as authoritative. */
function normalizeMeetingTime_(value) {
  if(typeof value==='number'&&Number.isFinite(value)){
    const minutes=Math.round(((value%1)+1)%1*1440)%1440;
    return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  const match=String(value==null?'':value).trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM)?$/i);
  if(!match)return '';
  let hour=Number(match[1]);const minute=Number(match[2]),period=String(match[3]||'').toUpperCase();
  if(minute>59||(period?(hour<1||hour>12):hour>23))return '';
  if(period)hour=hour%12+(period==='PM'?12:0);
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}
function readMeetingRows_(sheet) {
  if(!sheet||sheet.getLastRow()<2)return [];
  const range=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()),rows=range.getValues();
  const shown=typeof range.getDisplayValues==='function'?range.getDisplayValues():[];
  const timezone=sheet.getParent?.().getSpreadsheetTimeZone?.()||'Asia/Jakarta';
  return rows.map((row,index)=>{
    const result=row.slice();
    result[5]=row[5] instanceof Date?Utilities.formatDate(row[5],timezone,'yyyy-MM-dd'):formatDateVal(row[5]);
    [6,7].forEach(column=>{
      const value=row[column],display=shown[index]?.[column];
      result[column]=value instanceof Date?Utilities.formatDate(value,timezone,'HH:mm'):normalizeMeetingTime_(value);
      if(!result[column])result[column]=normalizeMeetingTime_(display);
    });
    return result;
  });
}
function appendMeetingRow_(sheet,row) {
  sheet.getRange(sheet.getLastRow()+1,6,1,3).setNumberFormat('@');
  sheet.appendRow(row);
}
function meetingRoomClash_(rows,roomId,date,start,end) {
  return rows.find(row=>{
    if(row[12]==='Dibatalkan'||String(row[3])!==String(roomId)||row[5]!==date)return false;
    if(!row[6]||!row[7])throw new Error('Jam agenda tersimpan tidak valid. Periksa jadwal ruangan sebelum membuat agenda baru.');
    return start<row[7]&&end>row[6];
  });
}

/**
 * Mendapatkan Spreadsheet aktif atau otomatis mencari/membuat baru di Google Drive.
 * Database baru hanya dibuatkan struktur sheet kosong.
 */
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');
  let ss = null;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      Logger.log("Spreadsheet ID tidak valid, mencari di Drive...");
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
  }

  // Jika masih null (standalone Apps Script), cari file di Google Drive atau buat baru
  if (!ss) {
    const files = DriveApp.getFilesByName('DB_SI_TAMU_DISKUM_BATAM');
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create('DB_SI_TAMU_DISKUM_BATAM');
      setupGoogleDriveFolders();
    }
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  // Pastikan struktur database tersedia tanpa mengisi data sampel.
  const sheetTamu = ss.getSheetByName('Data_Tamu');
  if (!sheetTamu) {
    setupSheetMasterPegawai(ss);
    setupSheetMasterOPD(ss);
    setupSheetMasterRuangan(ss);
    setupSheetDataTamu(ss);
    setupSheetDataRapat(ss);
    setupSheetDataPresensi(ss);
    setupSheetKendaliSPPD(ss);
  }

  return ss;
}

/**
 * Helper simpan base64 file ke Google Drive
 */
function saveBase64ToDrive(base64Data, fileName, mimeType, folderType) {
  if (!base64Data) return '';
  const props = PropertiesService.getScriptProperties();
  const folderId = folderType === 'surat' ? props.getProperty('FOLDER_SURAT_ID') : props.getProperty('FOLDER_BUKTI_ID');

  let folder;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {}
  }

  if (!folder) {
    const folders = setupGoogleDriveFolders();
    folder = DriveApp.getFolderById(folderType === 'surat' ? folders.suratId : folders.buktiId);
  }

  let cleanBase64 = base64Data;
  if (base64Data.indexOf(',') > -1) {
    cleanBase64 = base64Data.split(',')[1];
  }

  const decodedBytes = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decodedBytes, mimeType || 'application/octet-stream', fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getApprovalActor_() {
  const configuredName = PropertiesService.getScriptProperties().getProperty('APPROVER_NAME');
  if (configuredName) return configuredName.trim();

  const activeEmail = Session.getActiveUser().getEmail();
  return activeEmail || 'Admin Si Tari';
}

/**
 * Otomatisasi pembagian LO secara adil (Fair Round-Robin Workload Balancing)
 */
function assignLiaisonOfficer(ss, tujuanBidang) {
  const sheet = ss.getSheetByName('Master_Pegawai');
  if (!sheet || sheet.getLastRow() <= 1) return { id: null, nama: 'Petugas FO' };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  let targetBidang = 'Koperasi';
  if (tujuanBidang && tujuanBidang.toLowerCase().indexOf('mikro') > -1) {
    targetBidang = 'Usaha Mikro';
  } else if (tujuanBidang && (tujuanBidang.toLowerCase().indexOf('umpeg') > -1 || tujuanBidang.toLowerCase().indexOf('sekretariat') > -1)) {
    targetBidang = 'Sekretariat / Umpeg';
  }

  let candidates = data.filter(r => r[4] === targetBidang && r[5] == 1 && r[7] === 'Aktif');
  if (candidates.length === 0) {
    candidates = data.filter(r => r[5] == 1 && r[7] === 'Aktif');
  }

  if (candidates.length === 0) {
    return { id: null, nama: 'Petugas Piket FO', jabatan: 'Staf Penerima' };
  }

  candidates.sort((a, b) => Number(a[6]) - Number(b[6]));
  const chosen = candidates[0];

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == chosen[0]) {
      const rowIndex = i + 2;
      sheet.getRange(rowIndex, 7).setValue(Number(chosen[6]) + 1);
      break;
    }
  }

  return {
    id: chosen[0],
    nama: chosen[2],
    jabatan: chosen[3],
    bidang: chosen[4],
    nip: chosen[1]
  };
}

// ==========================================
// API CALLABLE FUNCTIONS
// ==========================================

function getDashboardData() {
  return readDashboardData_(true);
}

// Admin startup does not consume LO statistics; retain the legacy full endpoint.
function getDashboardSummary() {
  const result=readDashboardData_(false);
  delete result.data.loStats;
  return result;
}

function readDashboardData_(includeLoStats) {
  const ss = getSpreadsheet();
  const today = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');

  // Hitung Tamu
  const sheetTamu = ss.getSheetByName('Data_Tamu');
  let totalTamu = 0, tamuHariIni = 0, tamuLuar = 0, tamuFo = 0;
  let recentTamu = [];

  if (sheetTamu && sheetTamu.getLastRow() > 1) {
    const rows = sheetTamu.getRange(2, 1, sheetTamu.getLastRow() - 1, sheetTamu.getLastColumn()).getValues();
    totalTamu = rows.length;

    rows.forEach(r => {
      const tgl = formatDateVal(r[12]);
      if (tgl === today) tamuHariIni++;
      if (r[2] === 'luar_daerah') tamuLuar++;
      if (r[2] === 'dalam_daerah_fo') tamuFo++;
    });

    recentTamu = rows.slice(0, 5).map(r => ({
      id: r[0],
      kode_kunjungan: r[1],
      tipe_tamu: r[2],
      instansi: r[3],
      alamat: r[4],
      jumlah_orang: r[5],
      ketua_nama: r[6],
      tujuan_bidang: r[8],
      keperluan: r[9],
      narahubung_hp: r[11],
      tanggal_kunjungan: formatDateVal(r[12]),
      jam_kunjungan: formatTimeVal(r[13]),
      lo_nama: r[17],
      bawa_sppd: r[18],
      status_kunjungan: r[19]
    }));
  }

  // Hitung Rapat
  const sheetRapat = ss.getSheetByName('Data_Rapat');
  let rapatHariIni = 0;
  let todayMeetings = [];
  if (sheetRapat && sheetRapat.getLastRow() > 1) {
    const rows = readMeetingRows_(sheetRapat);
    rows.forEach(r => {
      const tgl = formatDateVal(r[5]);
      if (tgl === today && r[12] !== 'Dibatalkan') {
        rapatHariIni++;
        todayMeetings.push({
          id: r[0],
          kode_rapat: r[1],
          judul_rapat: r[2],
          ruangan_id: r[3],
          nama_ruangan: meetingRoomName_(r[4]),
          tanggal: tgl,
          jam_mulai: formatTimeVal(r[6]),
          jam_selesai: formatTimeVal(r[7]),
          penyelenggara_bidang: r[8],
          pimpinan_rapat: r[9],
          total_hadir: 0
        });
      }
    });
  }

  // Hitung SPPD
  const sheetSppd = ss.getSheetByName('Kendali_SPPD');
  let sppdTotal = 0, sppdBelumLengkap = 0, sppdSah = 0;
  if (sheetSppd && sheetSppd.getLastRow() > 1) {
    const rows = sheetSppd.getRange(2, 1, sheetSppd.getLastRow() - 1, sheetSppd.getLastColumn()).getValues();
    sppdTotal = rows.length;
    rows.forEach(r => {
      if (r[8] === 'Belum Lengkap') sppdBelumLengkap++;
      if (r[8] === 'Sah & Terverifikasi') sppdSah++;
    });
  }

  // Staf LO Stats
  const sheetPegawai = includeLoStats ? ss.getSheetByName('Master_Pegawai') : null;
  let loStats = [];
  if (sheetPegawai && sheetPegawai.getLastRow() > 1) {
    const rows = sheetPegawai.getRange(2, 1, sheetPegawai.getLastRow() - 1, sheetPegawai.getLastColumn()).getValues();
    loStats = rows.filter(r => r[5] == 1 && r[7] === 'Aktif').map(r => ({
      id: r[0],
      nip: r[1],
      nama: r[2],
      jabatan: r[3],
      bidang: r[4],
      workload_count: r[6]
    }));
  }

  return {
    success: true,
    data: {
      stats: {
        totalTamu,
        tamuHariIni,
        tamuLuar,
        tamuFo,
        rapatHariIni,
        sppd: { total: sppdTotal, belumLengkap: sppdBelumLengkap, sah: sppdSah }
      },
      recentTamu,
      todayMeetings,
      loStats
    }
  };
}

function getMasterData() {
  const ss = getSpreadsheet();
  return cachedMasterRead_(ss,'all',()=>readMasterData_(ss));
}

function cachedMasterRead_(ss,kind,read) {
  let cache,key;
  try {
    if(typeof CacheService!=='undefined'&&typeof ss.getId==='function'){
      cache=CacheService.getScriptCache();key='si-tari:master:v2:'+ss.getId()+':'+kind;
      const value=cache.get(key);if(value)return JSON.parse(value);
    }
  }catch(error){cache=null;}
  const result=read();
  if(cache)try{cache.put(key,JSON.stringify(result),120);}catch(error){}
  return result;
}
function invalidateMasterReadCache_(ss) {
  try {const cache=CacheService.getScriptCache();['all','rooms'].forEach(kind=>cache.remove('si-tari:master:v2:'+ss.getId()+':'+kind));}catch(error){}
}
function readMasterData_(ss) {
  const sheetPegawai = ss.getSheetByName('Master_Pegawai');
  const sheetOPD = ss.getSheetByName('Master_OPD');
  const sheetRuangan = ss.getSheetByName('Master_Ruangan');

  const pegawai = sheetPegawai && sheetPegawai.getLastRow() > 1 
    ? sheetPegawai.getRange(2, 1, sheetPegawai.getLastRow() - 1, sheetPegawai.getLastColumn()).getValues().map(r => ({ id: r[0], nip: r[1], nama: r[2], jabatan: r[3], bidang: r[4], pangkat:r[8]||'' }))
    : [];

  const opd = sheetOPD && sheetOPD.getLastRow() > 1
    ? sheetOPD.getRange(2, 1, sheetOPD.getLastRow() - 1, sheetOPD.getLastColumn()).getValues().map(r => ({ id: r[0], nama_opd: r[1], kategori: r[2] }))
    : [];

  const ruangan = sheetRuangan && sheetRuangan.getLastRow() > 1
    ? sheetRuangan.getRange(2, 1, sheetRuangan.getLastRow() - 1, sheetRuangan.getLastColumn()).getValues().map(r => ({ id: r[0], nama_ruangan: r[1], kapasitas: r[2], fasilitas: r[3], lokasi: r[4], warna: r[5] }))
    : [];

  return { success: true, data: { pegawai, opd, ruangan: normalizeMeetingRooms_(ruangan) } };
}

function getTamuList(spreadsheet) {
  const ss = spreadsheet || getSpreadsheet();
  const sheet = ss.getSheetByName('Data_Tamu');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true, data: [] };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return { success: true, data: rows.map(mapVisitRow_) };
}
function mapVisitRow_(r) {
  return {
    id: r[0],
    kode_kunjungan: r[1],
    tipe_tamu: r[2],
    instansi: r[3],
    alamat: r[4],
    jumlah_orang: r[5],
    ketua_nama: r[6],
    pengikut_list: r[7],
    tujuan_bidang: r[8],
    keperluan: r[9],
    narahubung_nama: r[10],
    narahubung_hp: r[11],
    tanggal_kunjungan: formatDateVal(r[12]),
    jam_kunjungan: formatTimeVal(r[13]),
    surat_kunjungan_file: r[14],
    surat_tugas_file: r[15],
    lo_id: r[16],
    lo_nama: r[17],
    bawa_sppd: r[18],
    status_kunjungan: r[19]
  };
}
function findRecordByColumn_(sheet,column,code,width) {
  if(!sheet||sheet.getLastRow()<2)return null;
  const range=sheet.getRange(2,column,sheet.getLastRow()-1,1);
  let row;
  if(typeof range.createTextFinder==='function'){
    const match=range.createTextFinder(String(code)).matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext();
    if(!match)return null;row=match.getRow();
  }else{
    const index=range.getValues().findIndex(r=>String(r[0])===String(code));if(index<0)return null;row=index+2;
  }
  return {row,values:sheet.getRange(row,1,1,width||sheet.getLastColumn()).getValues()[0]};
}
function getVisitByCode_(ss,code) {
  const found=findRecordByColumn_(ss.getSheetByName('Data_Tamu'),2,code);
  return found?mapVisitRow_(found.values):null;
}

function simpanJadwalRapat(p) {
  validateMeetingSchedule_(p);
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { return saveJadwalRapat_(p); } finally { lock.releaseLock(); }
}

function saveJadwalRapat_(p) {
  const ss = getSpreadsheet();
  const sheetRapat = ss.getSheetByName('Data_Rapat');
  if (!sheetRapat) throw new Error("Sheet Data_Rapat tidak ditemukan");
  const roomId=String(p.ruangan).split('|')[0];
  if (sheetRapat.getLastRow()>1) {
    const rows=readMeetingRows_(sheetRapat);
    if(meetingRoomClash_(rows,roomId,p.tanggal,p.jam_mulai,p.jam_selesai)) {
      return {success:false,error:'Ruangan sudah digunakan pada jadwal tersebut.'};
    }
  }

  const storedIds=sheetRapat.getLastRow()>1?sheetRapat.getRange(2,1,sheetRapat.getLastRow()-1,1).getValues().map(r=>r[0]):[];
  const nextId = storedIds.reduce((max,id)=>Math.max(max,Number(id)||0),0)+1;
  const dateStr = (p.tanggal || "").replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const kodeRapat = `RPT-${dateStr}-${randomSuffix}`;
  const timeNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

  // Split value ruangan: "1|Ruang Rapat Utama"
  const parts = p.ruangan.split('|');
  const ruangan_id = parts[0];
  const nama_ruangan = parts[1] || p.ruangan;

  appendMeetingRow_(sheetRapat,[
    nextId, kodeRapat, p.judul, ruangan_id, nama_ruangan,
    p.tanggal, p.jam_mulai, p.jam_selesai, p.bidang, p.pimpinan,
    0, p.agenda || '', 'Terjadwal', timeNow
  ]);

  autoSortAllSheets(ss);

  return {
    success: true,
    message: 'Jadwal Rapat berhasil dibuat.',
    data: { kode_rapat: kodeRapat }
  };
}

function getRapatCalendar() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Data_Rapat');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true, data: [] };

  const rows = readMeetingRows_(sheet);
  const docsSheet=ss.getSheetByName('Dokumen_Agenda');
  const docs=docsSheet&&docsSheet.getLastRow()>1?docsSheet.getRange(2,1,docsSheet.getLastRow()-1,3).getValues():[];
  // Match IDs as strings and retain the first row, including an empty document.
  const docsByAgendaId=new Map();
  docs.forEach(doc=>{const key=String(doc[0]);if(!docsByAgendaId.has(key))docsByAgendaId.set(key,doc);});
  const photos=typeof getAgendaPhotosMap_==='function'?getAgendaPhotosMap_(ss):{};
  const attendanceSheet=ss.getSheetByName('Data_Presensi');
  const attendance=attendanceSheet&&attendanceSheet.getLastRow()>1?attendanceSheet.getRange(2,1,attendanceSheet.getLastRow()-1,12).getValues():[];
  const manualAgendaIds=new Set(attendance.filter(row=>row[11]==='Admin').map(row=>String(row[1])));
  const list = rows.filter(r => r[12] !== 'Dibatalkan').map(r => {
    const doc=docsByAgendaId.get(String(r[0]));
    return {
    id: r[0],
    manual_attendance: manualAgendaIds.has(String(r[0])),
    photos: photos[String(r[0])]||[],
    kode_rapat: r[1],
    kode_kunjungan: String(r[1] || '').indexOf('VISIT-') === 0 ? String(r[1]).slice(6) : '',
    judul_rapat: r[2],
    ruangan_id: r[3],
    nama_ruangan: meetingRoomName_(r[4]),
    tanggal: formatDateVal(r[5]),
    jam_mulai: formatTimeVal(r[6]),
    jam_selesai: formatTimeVal(r[7]),
    penyelenggara_bidang: r[8],
    pimpinan_rapat: r[9],
    jumlah_peserta: r[10],
    agenda: r[11],
    status: doc?'Selesai':r[12],
    notula: doc&&doc[1]?JSON.parse(doc[1]):null
    };
  });

  return { success: true, data: list };
}

function createRapatSchedule(p) {
  validateMeetingSchedule_({judul:p.judul_rapat,ruangan:p.ruangan_id,tanggal:p.tanggal,jam_mulai:p.jam_mulai,jam_selesai:p.jam_selesai,bidang:p.penyelenggara_bidang,pimpinan:p.pimpinan_rapat,agenda:p.agenda});
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { return createRapatScheduleLocked_(p); } finally { lock.releaseLock(); }
}

function createRapatScheduleLocked_(p) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Data_Rapat');

  const clash=meetingRoomClash_(readMeetingRows_(sheet),p.ruangan_id,p.tanggal,p.jam_mulai,p.jam_selesai);
  if(clash)return {success:false,error:'BENTURAN JADWAL TERDETEKSI!',message:'Ruangan sudah dipesan pada '+clash[6]+' - '+clash[7]+'.'};

  const sheetRuangan = ss.getSheetByName('Master_Ruangan');
  let namaRuangan = 'Ruang Rapat';
  if (sheetRuangan && sheetRuangan.getLastRow() > 1) {
    const rRows = sheetRuangan.getRange(2, 1, sheetRuangan.getLastRow() - 1, sheetRuangan.getLastColumn()).getValues();
    const found = rRows.find(item => item[0] == p.ruangan_id);
    if (found) namaRuangan = found[1];
  }

  const storedIds=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().map(r=>r[0]):[];
  const nextId = storedIds.reduce((max,id)=>Math.max(max,Number(id)||0),0)+1;
  const dateStr = p.tanggal.replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const kodeRapat = `RPT-${dateStr}-${randomSuffix}`;
  const timeNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

  appendMeetingRow_(sheet,[
    nextId, kodeRapat, p.judul_rapat, p.ruangan_id, namaRuangan,
    p.tanggal, p.jam_mulai, p.jam_selesai, p.penyelenggara_bidang,
    p.pimpinan_rapat || '-', Number(p.jumlah_peserta) || 10, p.agenda || '', 'Terjadwal', timeNow
  ]);

  autoSortRapat(ss);
  return { success: true, message: 'Jadwal rapat berhasil diterbitkan di Shared Calendar tanpa benturan!' };
}

function submitPresensiRapat(p) {
  if(!p||(!String(p.nama||'').trim()&&!String(p.member_id||'').trim())) return {success:false,error:'Nama peserta wajib diisi.'};
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try { return savePresensiRapat_(p); } finally { lock.releaseLock(); }
}

function attendanceWriteTimes_(meeting,p,source,recordedAt) {
  const recorded=recordedAt||Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd HH:mm:ss');
  if(source!=='AdminEntry'){
    if(p.jam_kehadiran!=null&&p.jam_kehadiran!=='')throw new Error('Jam kehadiran manual hanya tersedia melalui presensi admin.');
    return {attendance:recorded,recorded:recorded};
  }
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.jam_kehadiran||'')))throw new Error('Jam kehadiran wajib dalam format 24 jam HH:mm.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(meeting.tanggal||'')))throw new Error('Tanggal agenda tidak valid.');
  return {attendance:meeting.tanggal+' '+p.jam_kehadiran+':00',recorded:recorded};
}
function submitAdminPresensiRapat(p) {
  let lock;
  try {
    requireVisitAdmin_();
    if(!p||(!String(p.nama||'').trim()&&!String(p.member_id||'').trim()))throw new Error('Nama peserta wajib diisi.');
    lock=LockService.getScriptLock();lock.waitLock(30000);
    return savePresensiRapat_(p,'AdminEntry');
  }catch(error){return {success:false,error:error.message};}finally{if(lock)lock.releaseLock();}
}

function savePresensiRapat_(p, source) {
  const meeting=getRapatCalendar().data.find(item=>String(item.id)===String(p.rapat_id));
  if(!meeting)return {success:false,error:'Agenda tidak ditemukan.'};
  const availability=source==='Admin'||source==='AdminEntry'?adminAttendanceAvailability_(meeting):attendanceAvailability_(meeting);
  if(!availability.open)return {success:false,error:availability.message};
  let times;try{times=attendanceWriteTimes_(meeting,p,source);}catch(error){return {success:false,error:error.message};}
  validateVisitAttendanceWrite_(p.rapat_id);
  const visitData=visitAttendanceForAgenda_(meeting);
  if(visitData) {
    const person=resolveVisitAttendee_(visitData.visit,p);
    if(hasVisitAttendance_(visitData.attendance,person))return {success:true,message:'Presensi nama ini sudah tercatat.'};
    p=Object.assign({},p,person,{nip:'',jabatan:String(p.jabatan||'').trim()||'-'});
  }
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Data_Presensi');
  if(sheet.getLastColumn()<12)sheet.getRange(1,11,1,2).setValues([['Anggota Kunjungan ID','Sumber Presensi']]);
  if(sheet.getLastColumn()<13)sheet.getRange(1,13).setValue('Waktu Pencatatan');
  const nextId = sheet.getLastRow();
  if(source==='AdminEntry')sheet.getRange(nextId+1,10).setNumberFormat('@');

  sheet.appendRow([
    nextId, p.rapat_id, meeting.judul_rapat, p.kategori_peserta,
    p.nama, p.nip || '-', p.jabatan || '-', p.nama_opd || 'Diskum Batam', p.no_hp || '-', times.attendance,
    visitData?p.member_id:'',source==='Admin'?'Admin':source==='AdminEntry'?'AdminEntry':'QR',times.recorded
  ]);

  autoSortPresensi(ss);
  return { success: true, message: `Presensi atas nama ${p.nama} berhasil dicatat!` };
}

function getSppdList(spreadsheet) {
  const ss = spreadsheet || getSpreadsheet();
  const sheet = ss.getSheetByName('Kendali_SPPD');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true, data: [] };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const list = rows.map(r => ({
    id: r[0],
    tamu_id: r[1],
    kode_kunjungan: r[2],
    instansi: r[3],
    ketua_nama: r[4],
    file_foto: r[5],
    file_absen: r[6],
    file_notulen: r[7],
    status_sppd: r[8],
    disetujui_pejabat_teknis: r[9] === 'Sudah TTD' ? 1 : 0,
    pejabat_teknis_nama: r[10],
    waktu_persetujuan_teknis: r[11],
    disetujui_kasubag: r[12] === 'Sudah TTD' ? 1 : 0,
    kasubag_nama: r[13],
    waktu_persetujuan_kasubag: r[14],
    catatan: r[15]
  }));

  return { success: true, data: list };
}

function uploadBuktiSppd(p) {
  rejectLegacyVisitSppd_(p.sppd_id);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Kendali_SPPD');
  if (!sheet || sheet.getLastRow() <= 1) return { success: false, error: 'Data tidak ditemukan' };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let rowIndex = -1;
  let current;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] == p.sppd_id) {
      rowIndex = i + 2;
      current = rows[i];
      break;
    }
  }

  if (rowIndex === -1) return { success: false, error: 'SPPD tidak ditemukan' };

  let urlFoto = current[5];
  let urlAbsen = current[6];
  let urlNotulen = current[7];

  if (p.foto_base64) {
    urlFoto = saveBase64ToDrive(p.foto_base64, `Foto_Kegiatan_${current[2]}.jpg`, 'image/jpeg', 'bukti');
  }
  if (p.absen_base64) {
    urlAbsen = saveBase64ToDrive(p.absen_base64, `Absen_${current[2]}.pdf`, 'application/pdf', 'bukti');
  }
  if (p.notulen_base64) {
    urlNotulen = saveBase64ToDrive(p.notulen_base64, `Notulen_${current[2]}.pdf`, 'application/pdf', 'bukti');
  }

  const isComplete = Boolean(urlFoto && urlAbsen && urlNotulen);
  let newStatus = current[8];
  if (isComplete && current[8] === 'Belum Lengkap') {
    newStatus = 'Menunggu Validasi Teknis';
  }

  sheet.getRange(rowIndex, 6).setValue(urlFoto);
  sheet.getRange(rowIndex, 7).setValue(urlAbsen);
  sheet.getRange(rowIndex, 8).setValue(urlNotulen);
  sheet.getRange(rowIndex, 9).setValue(newStatus);

  autoSortSppd(ss);

  return {
    success: true,
    is_complete: isComplete,
    message: isComplete 
      ? 'Ketiga bukti kegiatan lengkap! Status SPPD kini dapat divalidasi oleh Pejabat Teknis.' 
      : 'Bukti berhasil diunggah ke Google Drive. Lengkapi berkas lainnya sebelum TTD.'
  };
}

function ttdPejabatTeknis(sppdId) {
  rejectLegacyVisitSppd_(sppdId);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Kendali_SPPD');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] == sppdId) {
      const r = rows[i];
      const isComplete = Boolean(r[5] && r[6] && r[7]);
      if (!isComplete) {
        return {
          success: false,
          error: 'AKSES DITOLAK: Status SPPD TIDAK BISA ditandatangani oleh Pejabat Teknis sebelum bukti kegiatan (Foto, Absen, dan E-Notulen) diunggah lengkap ke dalam sistem!'
        };
      }

      const rowIndex = i + 2;
      const timeNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(rowIndex, 9).setValue('Menunggu Pengesahan Kasubag');
      sheet.getRange(rowIndex, 10).setValue('Sudah TTD');
      sheet.getRange(rowIndex, 11).setValue(getApprovalActor_());
      sheet.getRange(rowIndex, 12).setValue(timeNow);

      autoSortSppd(ss);
      return { success: true, message: 'Validasi Pejabat Teknis berhasil! Menunggu pengesahan akhir oleh Kasubag Umpeg.' };
    }
  }
  return { success: false, error: 'Data SPPD tidak ditemukan.' };
}

function ttdKasubagUmpeg(sppdId) {
  rejectLegacyVisitSppd_(sppdId);
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Kendali_SPPD');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] == sppdId) {
      const r = rows[i];
      const isComplete = Boolean(r[5] && r[6] && r[7]);
      if (!isComplete) {
        return {
          success: false,
          error: 'AKSES DITOLAK: Status SPPD TIDAK BISA disahkan sebelum ketiga bukti kegiatan lengkap diunggah!'
        };
      }

      if (r[9] !== 'Sudah TTD') {
        return {
          success: false,
          error: 'Prosedur Administrasi: Pejabat Teknis penerima harus memvalidasi terlebih dahulu sebelum disahkan oleh Kasubag Umpeg.'
        };
      }

      const rowIndex = i + 2;
      const timeNow = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(rowIndex, 9).setValue('Sah & Terverifikasi');
      sheet.getRange(rowIndex, 13).setValue('Sudah TTD');
      sheet.getRange(rowIndex, 14).setValue(getApprovalActor_());
      sheet.getRange(rowIndex, 15).setValue(timeNow);

      autoSortSppd(ss);
      return { success: true, message: 'SPPD RESMI DISAHKAN! Status SPPD kini SAH & TERVERIFIKASI.' };
    }
  }
  return { success: false, error: 'Data SPPD tidak ditemukan.' };
}
