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
  const category = String(record.kategori ?? record.kategori_peserta ?? '').trim();
  if ((category && category !== 'Diskum' && category !== 'Internal') || String(record.member_id || '').trim()) {
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
function agendaAttendanceTimeParts_(value,spreadsheetTimezone) {
  try {
    let display='',sort='';
    if(Object.prototype.toString.call(value)==='[object Date]'){
      if(!Number.isFinite(value.getTime()))return {display:'',sort:''};
      // Legacy cells were created from a WIB wall-time string in the sheet's timezone.
      display=Utilities.formatDate(value,spreadsheetTimezone||'Asia/Jakarta','yyyy-MM-dd HH:mm');
      const sec=String(value.getUTCSeconds()).padStart(2,'0');
      sort=display.length===16?display+':'+sec:display;
    }else{
      const text=String(value||'').trim();
      if(/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)){
        const instant=new Date(text);if(!Number.isFinite(instant.getTime()))return {display:'',sort:''};
        display=Utilities.formatDate(instant,'Asia/Jakarta','yyyy-MM-dd HH:mm');
        const sec=String(instant.getUTCSeconds()).padStart(2,'0');
        sort=display.length===16?display+':'+sec:display;
      }else{
        let match=text.match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/);
        if(match){
          display=match[1]+' '+match[2]+':'+match[3];
          sort=display+':'+(match[4]||'00');
        }else{
          match=text.match(/^(\d{2})-(\d{2})-(\d{4})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
          if(match){
            display=match[3]+'-'+match[2]+'-'+match[1]+' '+match[4]+':'+match[5];
            sort=display+':'+(match[6]||'00');
          }
        }
      }
    }
    return {display,sort};
  }catch(error){return {display:'',sort:''};}
}
function agendaAttendanceTime_(value,spreadsheetTimezone) {
  return agendaAttendanceTimeParts_(value,spreadsheetTimezone).display;
}
function sortAttendanceRecords_(records,spreadsheetTimezone,hierarchyOptions) {
  const list=Array.isArray(records)?records:[];
  const employees=hierarchyOptions&&Array.isArray(hierarchyOptions.employees)
    ?hierarchyOptions.employees
    :(typeof DISKUM_EMPLOYEE_DIRECTORY!=='undefined'&&Array.isArray(DISKUM_EMPLOYEE_DIRECTORY)?DISKUM_EMPLOYEE_DIRECTORY:[]);
  const lookup=buildAttendanceHierarchyLookup_(employees);
  return list.map((record,index)=>{
    const item=record&&typeof record==='object'?record:{};
    const rank=resolveAttendanceHierarchyRank_(item,lookup);
    const timeSource=item.rawWaktu!==undefined?item.rawWaktu:item.waktu;
    const timeParts=agendaAttendanceTimeParts_(timeSource,spreadsheetTimezone);
    const rawId=item.id;
    const parsedId=(rawId!==undefined&&rawId!==null&&String(rawId).trim()!=='')?Number(rawId):NaN;
    return {
      record:item,
      time:timeParts.display,
      sortTime:timeParts.sort,
      recordId:Number.isFinite(parsedId)?parsedId:null,
      index:index,
      tier:rank.tier,
      primary:rank.primary,
      secondary:rank.secondary
    };
  })
    .sort((a,b)=>(a.tier-b.tier)||(a.primary-b.primary)||(a.secondary-b.secondary)||(a.sortTime||'9999').localeCompare(b.sortTime||'9999')||((a.recordId!==null&&b.recordId!==null)?(a.recordId-b.recordId):0)||a.index-b.index)
    .map(entry=>Object.assign({},entry.record,{_canonicalTime:entry.time}));
}
function makeAgendaAttendanceList_(records,spreadsheetTimezone,hierarchyOptions) {
  return sortAttendanceRecords_(records,spreadsheetTimezone,hierarchyOptions)
    .map((record,index)=>{
      const namaOpd=String(record.nama_opd||record.bidang||'').trim()||'-';
      const time=record._canonicalTime||'';
      return {no:index+1,nama:String(record.nama||'-'),nama_opd:namaOpd,tanggal:time?time.slice(0,10).split('-').reverse().join('-'):'-',jam:time?time.slice(11,16):'-'};
    });
}
const AGENDA_DISPLAY_START_DATE_ = '2026-11-02';
function isAgendaDateOnOrAfterCutoff_(value, spreadsheetTimezone) {
  if (typeof isDisplayDateOnOrAfterCutoff_ === 'function') return isDisplayDateOnOrAfterCutoff_(value, AGENDA_DISPLAY_START_DATE_);
  if (!value) return false;
  let key = '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!Number.isFinite(value.getTime())) return false;
    if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
      key = Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd');
    } else {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
      const map = {};
      parts.forEach(p => { map[p.type] = p.value; });
      key = `${map.year}-${map.month}-${map.day}`;
    }
  } else {
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
      const parsed = new Date(str);
      if (Number.isFinite(parsed.getTime())) return isAgendaDateOnOrAfterCutoff_(parsed, spreadsheetTimezone);
    }
    const iso = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:$|[T\s].*)/);
    if (iso) key = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else {
      const dmy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:$|\s.*)/);
      if (dmy) key = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    }
  }
  return Boolean(key && key >= AGENDA_DISPLAY_START_DATE_);
}
function getAgendaAttendance(payload) {
  try {
    requireVisitAdmin_();
    const id=String(payload&&payload.rapat_id||'');if(!id)throw new Error('Pilih agenda yang valid.');
    const ss=getSpreadsheet(),calendar=ss.getSheetByName('Data_Rapat');
    const meetingCols=calendar&&typeof calendar.getLastColumn==='function'?Math.max(3,Math.min(13,calendar.getLastColumn())):13;
    const meeting=calendar&&calendar.getLastRow()>1?calendar.getRange(2,1,calendar.getLastRow()-1,meetingCols).getValues().find(row=>String(row[0])===id):null;
    const timezone=ss&&typeof ss.getSpreadsheetTimeZone==='function'?ss.getSpreadsheetTimeZone():'Asia/Jakarta';
    if(!meeting||meeting[12]==='Dibatalkan'||!isAgendaDateOnOrAfterCutoff_(meeting[5],timezone))throw new Error('Agenda tidak ditemukan.');
    const sheet=ss.getSheetByName('Data_Presensi');
    const rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues():[];
    const records=rows.filter(row=>{
      if(String(row[1])!==id)return false;
      const parts=agendaAttendanceTimeParts_(row[9],timezone);
      const recordDate=parts.display?parts.display.substring(0,10):'';
      return !recordDate||recordDate>=AGENDA_DISPLAY_START_DATE_;
    }).map(row=>({id:row[0],kategori:row[3],nama:row[4],nip:row[5],jabatan:row[6],bidang:row[7],waktu:row[9]}));
    const employees=readMasterEmployeesForOrder_(ss);
    const attendance=makeAgendaAttendanceList_(records,timezone,{employees});
    return {success:true,data:{agenda:{id:meeting[0],judul_rapat:String(meeting[2]||'')},total:attendance.length,attendance:attendance}};
  }catch(error){return {success:false,error:error.message};}
}
