/** Visit workflow rules shared by Apps Script and the isolated local harness. */
function newVisitWorkflow_(visit) {
  const statuses = ['Menunggu Konfirmasi', 'Sudah Disposisi', 'Menunggu Kedatangan', 'Kelola SPPD', 'Selesai'];
  const eligible = visit.tipe_tamu === 'luar_daerah';
  return {
    version: 0, status: eligible ? (statuses.includes(visit.status_kunjungan) ? visit.status_kunjungan : 'Menunggu Konfirmasi') : 'Non-SPPD',
    acknowledged: null, disposisi: null, notifications: [], booking: null, arrival: null,
    files: {}, exported: null, signed: null, history: []
  };
}

function visitWorkflowStage_(state) {
  if (state.status === 'Selesai') return 5;
  if (state.status === 'Kelola SPPD') return 4;
  if (state.status === 'Menunggu Kedatangan') return 3;
  if (state.status === 'Sudah Disposisi') return 2;
  return state.acknowledged ? 1 : 0;
}

function validateVisitFile_(file) {
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(file && file.data || ''));
  if (!match || match[2].length % 4 !== 0) throw new Error('Dokumen harus PDF atau foto yang valid.');
  const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (size > 5 * 1024 * 1024) throw new Error('Ukuran setiap file maksimal 5 MB.');
  if (!size) throw new Error('File dokumen kosong.');
  return { mime: match[1], size: size };
}

function applyVisitWorkflow_(visit, current, payload, env) {
  if (current.status === 'Non-SPPD') throw new Error('Non-SPPD tidak menggunakan alur ini.');
  if (current.status === 'Selesai') throw new Error('Kunjungan selesai hanya dapat dibaca.');
  if (Number(payload.version) !== current.version) throw new Error('Data sudah berubah. Muat ulang sebelum menyimpan.');
  const state = JSON.parse(JSON.stringify(current));
  const stage = visitWorkflowStage_(state);
  const stamp = { at: env.now, actor: env.actor };
  const requireStage = expected => { if (stage !== expected) throw new Error('Tahap belum tersedia atau sudah diselesaikan.'); };
  const save = (file, kind) => { validateVisitFile_(file); return env.saveFile(file, kind); };
  switch (payload.action) {
    case 'destinations':
      if(stage>1||state.booking)throw new Error('Bidang tujuan hanya dapat dipilih sebelum disposisi dan pemesanan ruangan.');
      state.destinations=env.selectDestinations(payload.destinations);
      state.contactNotification=null;state.notifications=[];break;
    case 'reschedule': {
      if (stage > 1 || state.booking) throw new Error('Ganti jadwal hanya tersedia sebelum disposisi dan pemesanan ruangan.');
      const s=payload.schedule||{};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.tanggal||'') || Number.isNaN(Date.parse(s.tanggal)) || new Date(s.tanggal).toISOString().slice(0,10)!==s.tanggal || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.jam||'')) throw new Error('Tanggal dan jam kunjungan tidak valid.');
      state.schedule=env.reschedule({tanggal:s.tanggal,jam:s.jam});
      state.contactNotification=null;
      break;
    }
    case 'notifyContact':
      if (stage > 1 || state.booking) throw new Error('Notifikasi narahubung hanya tersedia pada tahap konfirmasi.');
      if(!String((state.destinations&&state.destinations.bidang)||visit.tujuan_bidang||'').trim())throw new Error('Pilih Bidang Tujuan terlebih dahulu.');
      state.contactNotification=env.notifyContact(state.contactNotification); break;
    case 'confirm':
      if(!String((state.destinations&&state.destinations.bidang)||visit.tujuan_bidang||'').trim())throw new Error('Pilih Bidang Tujuan sebelum konfirmasi.');
      requireStage(0); state.acknowledged = stamp; break;
    case 'disposisi':
      if (!state.acknowledged) throw new Error('Konfirmasi permintaan terlebih dahulu.');
      requireStage(1); state.disposisi = save(payload.file, 'disposisi'); state.status = 'Sudah Disposisi'; break;
    case 'notify': {
      requireStage(2);
      const results = env.notify(state.notifications);
      state.notifications = results;
      break;
    }
    case 'book':
      requireStage(2);
      if (!env.recipients.length || !env.recipients.every(pic => state.notifications.some(n => n.pic === pic && n.success))) {
        throw new Error('Selesaikan notifikasi untuk semua penerima tamu terlebih dahulu.');
      }
      state.booking = env.book(payload.booking);
      state.schedule={tanggal:state.booking.tanggal,jam:state.booking.jam_mulai};
      state.status = 'Menunggu Kedatangan'; break;
    case 'arrival':
      requireStage(3);
      if (state.booking && state.booking.status === 'Ditunda') throw new Error('Agenda kunjungan sedang ditunda. Jadwalkan ulang terlebih dahulu.');
      if (!state.booking || !env.attendance.length) throw new Error('Belum ada presensi untuk agenda kunjungan ini.');
      if (!state.retrospective && Date.parse(env.now) < Date.parse(state.booking.tanggal + 'T' + (state.booking.jam_selesai || state.booking.jam_mulai) + ':00+07:00')) {
        throw new Error('Waktu kunjungan belum selesai berlangsung.');
      }
      state.arrival = Object.assign({}, stamp, { count: env.attendance.length }); state.status = 'Kelola SPPD'; break;
    case 'evidence': {
      requireStage(4);
      const files = payload.files || {};
      if (!files.foto) throw new Error('Pilih foto kegiatan terlebih dahulu.');
      // Validate all files before writing either of them.
      validateVisitFile_(files.foto);
      state.files.foto=save(files.foto,'foto');
      break;
    }
    case 'finish':
      requireStage(4);
      state.note=String(payload.note||'').trim();
      if (!state.note) throw new Error('Catatan wajib diisi.');
      if (Array.from(state.note).length>300) throw new Error('Catatan maksimal 300 karakter.');
      if (!state.files.foto) throw new Error('Lengkapi foto kegiatan terlebih dahulu.');
      if (!env.attendance.length) throw new Error('Daftar hadir agenda belum tersedia.');
      state.files.absen=env.generateAttendance();
      state.completed=stamp; state.status = 'Selesai'; break;
    default: throw new Error('Aksi kunjungan tidak dikenal.');
  }
  state.version++;
  state.history.push(Object.assign({}, stamp, { action: payload.action, status: state.status }));
  return state;
}

function chooseVisitDestinations_(requested,directory) {
  const names=Array.isArray(requested)?[...new Set(requested)]:[];
  if(!names.length||names.some(name=>!directory.some(d=>d.bidang===name)))throw new Error('Pilih minimal satu Bidang Tujuan yang tersedia.');
  const selected=directory.filter(d=>names.includes(d.bidang));
  return {bidang:selected.map(d=>d.bidang).join('; '),pic:selected.map(d=>d.pic).join('; '),picIds:selected.map(d=>d.id||d.bidang).join('; ')};
}

function validateVisitBooking_(booking, visit, rooms, meetings, excludeMeetingId) {
  if (!booking) throw new Error('Lengkapi pemesanan ruangan.');
  const room = rooms.find(item => String(item.id) === String(booking.ruangan_id));
  if (!room) throw new Error('Pilih ruangan yang tersedia.');
  if (Number(room.kapasitas)>0 && Number(visit.jumlah_orang) > Number(room.kapasitas)) throw new Error('Jumlah tamu melebihi kapasitas ruangan.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.tanggal || '') || Number.isNaN(Date.parse(booking.tanggal)) || new Date(booking.tanggal).toISOString().slice(0, 10) !== booking.tanggal) throw new Error('Tanggal tidak valid.');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(booking.jam_mulai) || !time.test(booking.jam_selesai) || booking.jam_mulai >= booking.jam_selesai) throw new Error('Jam mulai/selesai tidak valid.');
  if (meetings.some(m => (excludeMeetingId == null || String(m.id) !== String(excludeMeetingId)) && !['Dibatalkan', 'Ditunda'].includes(m.status) && String(m.ruangan_id) === String(room.id) && m.tanggal === booking.tanggal && booking.jam_mulai < m.jam_selesai && booking.jam_selesai > m.jam_mulai)) {
    throw new Error('Ruangan sudah digunakan pada jadwal tersebut.');
  }
  return Object.assign({}, booking, { nama_ruangan: room.nama_ruangan, ruangan_id: room.id });
}

function nextVisitAgendaId_(ids) {
  return ids.reduce((max,id)=>Math.max(max,Number(id)||0),0)+1;
}

function normalizeVisitName_(name) { return String(name || '').trim().replace(/\s+/g,' ').toLowerCase(); }

function getVisitRoster_(visit) {
  const names=[{id:'ketua',nama:String(visit.ketua_nama||'').trim(),peran:'Ketua Rombongan'}];
  String(visit.pengikut_list||'').split(/[\r\n;]+/).forEach((name,index)=>{
    const clean=name.replace(/^\s*(?:\d+[.)]\s*|[-•]\s*)/,'').trim();
    if(clean)names.push({id:'anggota-'+(index+1),nama:clean,peran:'Anggota Rombongan'});
  });
  const seen={};
  return names.filter(member=>{const key=normalizeVisitName_(member.nama);if(!key||seen[key])return false;seen[key]=true;return true;});
}

function resolveVisitAttendee_(visit,payload) {
  const roster=getVisitRoster_(visit);
  const member=payload.member_id?roster.find(m=>m.id===payload.member_id):roster.find(m=>normalizeVisitName_(m.nama)===normalizeVisitName_(payload.nama));
  if(!member)throw new Error('Pilih nama dari daftar rombongan yang terdaftar untuk kunjungan ini.');
  return {member_id:member.id,nama:member.nama,nama_opd:visit.instansi||'',kategori_peserta:'Tamu_Luar'};
}

function hasVisitAttendance_(entries,member) {
  return entries.some(a=>a.member_id===member.member_id||normalizeVisitName_(a.nama)===normalizeVisitName_(member.nama));
}
