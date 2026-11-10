/** Admin-only, read-only attendance overview for both internal and visit agendas. */
const OFFICIAL_LEADERSHIP_ORDER_ = [
  { no: 1, nama: 'Salim, S.Sos, M.Si', nip: '19681021 199010 1 001' },
  { no: 2, nama: 'Adrial, S.K.M, M.K.M.', nip: '19710520 199403 1 009' },
  { no: 3, nama: 'Syofya Nora, S.H.I.', nip: '19771107 200212 2 007' },
  { no: 4, nama: 'Padlinsono, M.Si.', nip: '19761206 200212 1 012' },
  { no: 5, nama: 'Eva Corrina, S.E.', nip: '19750426 199403 2 003' },
  { no: 6, nama: 'Leny Nuriskawaty, S.Si. Apt., M.H.', nip: '19780604 200502 2 005' },
  { no: 7, nama: 'Zulfahri, S.E., M.M.', nip: '19781119 200212 1 003' },
  { no: 8, nama: 'Meydiana Esterawaty Jastina, S.E.', nip: '19760521 201001 2 002' },
  { no: 9, nama: 'Zuziani, S.E.', nip: '19810902 200212 2 004' },
  { no: 10, nama: 'Maslinda, S.E.', nip: '19750525 200212 2 015' },
  { no: 11, nama: 'Septia Yorita, S.E.', nip: '19810906 200901 2 002' },
  { no: 12, nama: 'Intan Permata Sari, S.E.', nip: '19810322 200604 2 012' },
  { no: 13, nama: 'Hafidz Qodli Abdillah, S.E.', nip: '19920215 202012 1 005' }
];
const OFFICIAL_UNIT_ORDER_ = [
  'Dinas',
  'Sekretariat',
  'Bidang Pemberdayaan dan Pelindungan Koperasi',
  'Bidang Pengawasan Koperasi',
  'Bidang Kewirausahaan',
  'Bidang Pengembangan Usaha Mikro',
  'UPTD Pengelolaan Dana Bergulir',
  'UPTD PLUT KUMKM',
  'UPTD Pemberdayaan dan Pelindungan Koperasi'
];
function normalizeAttendanceNip_(value) {
  return String(value || '').replace(/\s+/g, '').replace(/^-$/, '');
}
function normalizeAttendanceName_(value) {
  return String(value || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}
function readMasterEmployeesForOrder_(ss) {
  const sheet = ss && typeof ss.getSheetByName === 'function' ? ss.getSheetByName('Master_Pegawai') : null;
  if (sheet && typeof sheet.getLastRow === 'function' && sheet.getLastRow() > 1) {
    const width = typeof sheet.getLastColumn === 'function' ? Math.max(5, Math.min(9, sheet.getLastColumn())) : 9;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
    const valid = rows
      .filter(r => String(r[2] || '').trim() && String(r[3] || '').trim() && String(r[4] || '').trim())
      .map(r => ({ nip: r[1], nama: r[2], jabatan: r[3], bidang: r[4] }));
    if (valid.length) return valid;
  }
  return typeof DISKUM_EMPLOYEE_DIRECTORY !== 'undefined' && Array.isArray(DISKUM_EMPLOYEE_DIRECTORY)
    ? DISKUM_EMPLOYEE_DIRECTORY
    : [];
}
function buildAttendanceHierarchyLookup_(employees) {
  const leaderByNip = new Map();
  const leaderByName = new Map();
  OFFICIAL_LEADERSHIP_ORDER_.forEach((item, idx) => {
    const nip = normalizeAttendanceNip_(item.nip);
    const name = normalizeAttendanceName_(item.nama);
    if (nip) leaderByNip.set(nip, idx);
    if (name) leaderByName.set(name, idx);
  });
  const empByNip = new Map();
  const empByName = new Map();
  (Array.isArray(employees) ? employees : []).forEach((emp, idx) => {
    const unitRank = OFFICIAL_UNIT_ORDER_.indexOf(String(emp.bidang || '').trim());
    const pos = { unitRank: unitRank < 0 ? OFFICIAL_UNIT_ORDER_.length : unitRank, empIdx: idx };
    const nip = normalizeAttendanceNip_(emp.nip);
    const name = normalizeAttendanceName_(emp.nama);
    if (nip && !empByNip.has(nip)) empByNip.set(nip, pos);
    if (name && !empByName.has(name)) empByName.set(name, pos);
  });
  return { leaderByNip, leaderByName, empByNip, empByName };
}
function resolveAttendanceHierarchyRank_(record, lookup) {
  const category = String(record.kategori || '').trim();
  if (category && category !== 'Diskum' && category !== 'Internal') {
    return { tier: 2, primary: 0, secondary: 0 };
  }
  const nip = normalizeAttendanceNip_(record.nip);
  const name = normalizeAttendanceName_(record.nama);
  const leaderRank = (nip && lookup.leaderByNip.has(nip))
    ? lookup.leaderByNip.get(nip)
    : (name && lookup.leaderByName.has(name) ? lookup.leaderByName.get(name) : -1);
  if (leaderRank >= 0) return { tier: 0, primary: leaderRank, secondary: 0 };
  const empRank = (nip && lookup.empByNip.has(nip))
    ? lookup.empByNip.get(nip)
    : (name && lookup.empByName.has(name) ? lookup.empByName.get(name) : null);
  if (empRank) return { tier: 1, primary: empRank.unitRank, secondary: empRank.empIdx };
  return { tier: 2, primary: 0, secondary: 0 };
}
function agendaAttendanceTime_(value,spreadsheetTimezone) {
  try {
    let canonical='';
    if(Object.prototype.toString.call(value)==='[object Date]'){
      if(!Number.isFinite(value.getTime()))return '';
      // Legacy cells were created from a WIB wall-time string in the sheet's timezone.
      canonical=Utilities.formatDate(value,spreadsheetTimezone||'Asia/Jakarta','yyyy-MM-dd HH:mm');
    }else{
      const text=String(value||'').trim();
      if(/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)){
        const instant=new Date(text);if(!Number.isFinite(instant.getTime()))return '';
        canonical=Utilities.formatDate(instant,'Asia/Jakarta','yyyy-MM-dd HH:mm');
      }else{
        const match=text.match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::\d{2}(?:\.\d+)?)?$/);
        if(match)canonical=match[1]+' '+match[2]+':'+match[3];
      }
    }
    return canonical;
  }catch(error){return '';}
}
function makeAgendaAttendanceList_(records,spreadsheetTimezone,hierarchyOptions) {
  const employees=hierarchyOptions&&Array.isArray(hierarchyOptions.employees)
    ?hierarchyOptions.employees
    :(typeof DISKUM_EMPLOYEE_DIRECTORY!=='undefined'&&Array.isArray(DISKUM_EMPLOYEE_DIRECTORY)?DISKUM_EMPLOYEE_DIRECTORY:[]);
  const lookup=buildAttendanceHierarchyLookup_(employees);
  return records.map((record,index)=>{
    const rank=resolveAttendanceHierarchyRank_(record,lookup);
    return {nama:String(record.nama||'-'),time:agendaAttendanceTime_(record.waktu,spreadsheetTimezone),index:index,tier:rank.tier,primary:rank.primary,secondary:rank.secondary};
  })
    .sort((a,b)=>(a.tier-b.tier)||(a.primary-b.primary)||(a.secondary-b.secondary)||(a.time||'9999').localeCompare(b.time||'9999')||a.index-b.index)
    .map((record,index)=>({no:index+1,nama:record.nama,tanggal:record.time?record.time.slice(0,10).split('-').reverse().join('-'):'-',jam:record.time?record.time.slice(11,16):'-'}));
}
function getAgendaAttendance(payload) {
  try {
    requireVisitAdmin_();
    const id=String(payload&&payload.rapat_id||'');if(!id)throw new Error('Pilih agenda yang valid.');
    const ss=getSpreadsheet(),calendar=ss.getSheetByName('Data_Rapat');
    const meeting=calendar&&calendar.getLastRow()>1?calendar.getRange(2,1,calendar.getLastRow()-1,3).getValues().find(row=>String(row[0])===id):null;
    if(!meeting)throw new Error('Agenda tidak ditemukan.');
    const sheet=ss.getSheetByName('Data_Presensi');
    const rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues():[];
    const records=rows.filter(row=>String(row[1])===id).map(row=>({kategori:row[3],nama:row[4],nip:row[5],jabatan:row[6],bidang:row[7],waktu:row[9]}));
    const employees=readMasterEmployeesForOrder_(ss);
    const attendance=makeAgendaAttendanceList_(records,ss.getSpreadsheetTimeZone(),{employees});
    return {success:true,data:{agenda:{id:meeting[0],judul_rapat:String(meeting[2]||'')},total:attendance.length,attendance:attendance}};
  }catch(error){return {success:false,error:error.message};}
}
