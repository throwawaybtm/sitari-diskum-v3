/** Room presentation settings; existing sheet IDs remain authoritative for bookings. */
const MEETING_ROOM_DIRECTORY = [
  { name: 'Ruang Rapat Utama Diskum', capacity: 50, aliases: ['rapat utama'], accentClass: 'bg-blue-700', badgeClass: 'bg-blue-100 text-blue-800', colour: 'blue' },
  { name: 'Ruangan Bidang Koperasi & UMKM', capacity: 5, aliases: ['konsultasi', 'bidang koperasi & umkm'], accentClass: 'bg-emerald-700', badgeClass: 'bg-emerald-100 text-emerald-800', colour: 'emerald' },
  { name: 'Ruang Rapat Pimpinan / Kadis', capacity: 10, aliases: ['rapat pimpinan', 'rapat kadis'], accentClass: 'bg-violet-700', badgeClass: 'bg-violet-100 text-violet-800', colour: 'violet' },
  { name: 'Ruangan Rapat UPTD PLUT KUMKM', capacity: null, aliases: ['plut'], accentClass: 'bg-cyan-700', badgeClass: 'bg-cyan-100 text-cyan-800', colour: 'cyan' }
];

function meetingRoomName_(name) {
  const text=String(name||'').toLowerCase();
  const room=MEETING_ROOM_DIRECTORY.find(item=>item.aliases.some(alias=>text.indexOf(alias)!==-1));
  return room?room.name:name;
}

function normalizeMeetingRooms_(rooms) {
  return rooms.map(room => {
    const name = String(room.nama_ruangan || '').toLowerCase();
    const info = MEETING_ROOM_DIRECTORY.find(item => item.aliases.some(alias => name.indexOf(alias) !== -1));
    return info ? Object.assign({}, room, { nama_ruangan: info.name, kapasitas: info.capacity, lokasi: 'Lantai 1', warna: info.colour }) : null;
  }).filter(Boolean);
}

function readMeetingRoomOptions_(ss) {
  const sheet=ss.getSheetByName('Master_Ruangan');
  const rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues():[];
  return normalizeMeetingRooms_(rows.map(r=>({id:r[0],nama_ruangan:r[1],kapasitas:r[2],fasilitas:r[3],lokasi:r[4],warna:r[5]})));
}
function getMeetingRoomOptions() {
  return {success:true,data:{ruangan:readCachedMeetingRoomOptions_(getSpreadsheet())}};
}
function readCachedMeetingRoomOptions_(ss) {
  const read=()=>readMeetingRoomOptions_(ss);
  return typeof cachedMasterRead_==='function'?cachedMasterRead_(ss,'rooms',read):read();
}

function validateMeetingSchedule_(payload) {
  const fields = {
    judul: 'Judul agenda rapat', ruangan: 'Ruangan rapat', tanggal: 'Tanggal',
    jam_mulai: 'Jam mulai', jam_selesai: 'Jam selesai', bidang: 'Bidang penyelenggara',
    pimpinan: 'Pimpinan rapat', agenda: 'Agenda / keterangan'
  };
  Object.keys(fields).forEach(field => {
    if (!payload || !String(payload[field] || '').trim()) throw new Error(fields[field] + ' wajib diisi.');
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.tanggal) ||
      Number.isNaN(Date.parse(payload.tanggal)) ||
      new Date(payload.tanggal).toISOString().slice(0, 10) !== payload.tanggal) {
    throw new Error('Tanggal rapat tidak valid.');
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(payload.jam_mulai) || !timePattern.test(payload.jam_selesai)) throw new Error('Jam rapat tidak valid.');
  if (payload.jam_selesai <= payload.jam_mulai) throw new Error('Jam selesai harus setelah jam mulai.');
}

function isAgendaEnded_(meeting,now) {
  if(meeting.status==='Selesai')return true;
  const end=Date.parse(String(meeting.tanggal)+'T'+String(meeting.jam_selesai)+':00+07:00');
  return Number.isFinite(end)&&(now||new Date()).getTime()>=end;
}

function attendanceAvailability_(meeting,now) {
  if(!meeting)return {open:false,reason:'invalid',message:'Pilih agenda yang valid.'};
  if(['Selesai','Terlaksana','Dibatalkan'].includes(meeting.status)||meeting.notula)return {open:false,reason:'closed',message:'Agenda sudah selesai. Gunakan pencatatan admin untuk melengkapi presensi.'};
  if(meeting.manual_attendance)return {open:false,reason:'manual',message:'Presensi sudah diisi manual. Gunakan Presensi Manual untuk melengkapi daftar hadir.'};
  const date=String(meeting.tanggal||''),opensAt=/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date+'T00:00:00+07:00'):NaN;
  if(!Number.isFinite(opensAt))return {open:false,reason:'invalid',message:'Tanggal agenda tidak valid.'};
  if((now||new Date()).getTime()<opensAt)return {open:false,reason:'future',message:'Presensi dibuka mulai '+date.split('-').reverse().join('-')+' pukul 00:00 WIB.'};
  return {open:true,reason:'open',message:'Presensi tersedia sejak tanggal agenda sampai agenda selesai atau presensi divalidasi.'};
}
function adminAttendanceAvailability_(meeting,now) {
  if(!meeting||meeting.status==='Dibatalkan')return {open:false,reason:'closed',message:'Agenda tidak tersedia atau dibatalkan.'};
  return attendanceAvailability_(Object.assign({},meeting,{status:'Terjadwal',notula:null,manual_attendance:false}),now);
}

function ensurePlutMeetingRoom_() {
  const props=PropertiesService.getScriptProperties();if(props.getProperty('SEPARATE_BIDANG_PLUT_V2'))return;
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    if(props.getProperty('SEPARATE_BIDANG_PLUT_V2'))return;
    const sheet=getSpreadsheet().getSheetByName('Master_Ruangan');
    const rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues():[];
    // Preserve an existing combined room ID as Ruangan Bidang; create PLUT separately.
    const combined=rows.findIndex(r=>String(r[1])==='Ruangan Bidang - Gedung PLUT');
    if(combined>=0){sheet.getRange(combined+2,2).setValue('Ruangan Bidang');rows[combined][1]='Ruangan Bidang';}
    let next=rows.reduce((n,r)=>Math.max(n,Number(r[0])||0),0)+1;
    ['Ruangan Bidang','Gedung PLUT'].forEach(name=>{if(!rows.some(r=>String(r[1])===name))sheet.appendRow([next++,name,'','',name==='Gedung PLUT'?'Gedung PLUT':'Lantai 1',name==='Gedung PLUT'?'#0e7490':'#b45309']);});
    props.setProperty('SEPARATE_BIDANG_PLUT_V2','true');
    if(typeof invalidateMasterReadCache_==='function')invalidateMasterReadCache_(getSpreadsheet());
  }finally{lock.releaseLock();}
}
