'use strict';
const fs = require('node:fs');
const path = require('node:path');

const { prepareVisit } = require('./tld-directory');
const { prepareVisit: prepareTddVisit } = require('./tdd-directory');
const { normalize: normalizeMeetingRooms } = require('./meeting-rooms');
const {
  createVisitWorkflow,
  PEMKO_OPD_OPTIONS,
  normalizeJakartaDateKey,
  isDisplayDateOnOrAfterCutoff,
  isVisitDisplayDateOnOrAfterCutoff,
  parseVisitCodeDateKey
} = require('./visit-workflow');
const { jsPDF } = require('./vendor/jspdf.umd.min.js');

function jakartaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function jakartaTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function normalizeDiskumDepartment(bidang) {
  const raw = String(bidang || '').trim();
  return raw === 'UPTD Pemberdayaan dan Pelindungan Koperasi'
    ? 'Bidang Pemberdayaan dan Pelindungan Koperasi'
    : raw;
}

function loadRealEmployeeDirectory() {
  const filePath = path.join(__dirname, 'previews', 'employee-directory.json');
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(item => item && String(item.nama || '').trim())
      .map((item, idx) => ({ ...item, id: item.id || (10001 + idx), bidang: normalizeDiskumDepartment(item.bidang) }));
  } catch (_) {
    return [];
  }
}

function compareVisitsDesc(a, b) {
  const dateA = normalizeJakartaDateKey(a && a.tanggal_kunjungan);
  const dateB = normalizeJakartaDateKey(b && b.tanggal_kunjungan);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const timeA = String(a && a.jam_kunjungan || '');
  const timeB = String(b && b.jam_kunjungan || '');
  if (timeA !== timeB) return timeB.localeCompare(timeA);
  const idA = Number(a && a.id);
  const idB = Number(b && b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idB - idA;
  return 0;
}

function createFixtureStore(now = new Date(), options = {}) {
  const currentTime = typeof now === 'function' ? now : () => new Date(now);
  now = currentTime();
  const today = jakartaDate(now);
  const yesterday = jakartaDate(new Date(now.getTime() - 86400000));
  const tomorrow = jakartaDate(new Date(now.getTime() + 86400000));
  const visitDate = value => value.split('-').reverse().join('');

  const visitors = [];
  const meetings = [];
  const sppd = [];

  const masterData = {
    pegawai: Array.isArray(options.employees) ? options.employees.map((p, idx) => ({ ...p, id: p.id || (10001 + idx), bidang: normalizeDiskumDepartment(p.bidang) })) : loadRealEmployeeDirectory(),
    opd: PEMKO_OPD_OPTIONS.map((nama_opd, idx) => ({ id: 4001 + idx, nama_opd, kategori: 'Pemko Batam' })),
    ruangan: [
      { id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50, fasilitas: 'Proyektor', lokasi: 'Lantai 1', warna: 'blue' },
      { id: 6002, nama_ruangan: 'Ruangan Bidang Koperasi & UMKM', kapasitas: 5, fasilitas: 'TV', lokasi: 'Lantai 1', warna: 'emerald' },
      { id: 6003, nama_ruangan: 'Ruang Rapat Pimpinan / Kadis', kapasitas: 10, fasilitas: '', lokasi: 'Lantai 1', warna: 'violet' },
      { id: 6005, nama_ruangan: 'Ruangan Rapat UPTD PLUT KUMKM', kapasitas: null, fasilitas: '', lokasi: 'Gedung PLUT', warna: 'cyan' }
    ]
  };

  const rooms = normalizeMeetingRooms(masterData.ruangan);
  const visitWorkflow = createVisitWorkflow({ visitors, meetings, sppd, rooms, employees: masterData.pegawai, currentTime });

  function previewDocument(title, visit, attendance) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text(title, 20, 25);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    let y = 42;
    for (const text of [visit.kode_kunjungan, visit.instansi, visit.ketua_nama, visit.keperluan]) {
      const lines = doc.splitTextToSize(String(text), 170);
      doc.text(lines, 20, y);
      y += lines.length * 6 + 5;
    }
    if (attendance) {
      y += 6;
      doc.setFont('times', 'bold');
      doc.text('No.', 20, y);
      doc.text('Nama', 35, y);
      doc.text('Jabatan', 130, y);
      doc.setFont('times', 'normal');
      attendance.forEach((person, i) => {
        y += 8;
        doc.text(String(i + 1), 20, y);
        doc.text(person.nama, 35, y);
        doc.text(person.jabatan || '-', 130, y);
      });
    }
    return visitWorkflow.saveFile({
      name: `${title}.pdf`,
      data: 'data:application/pdf;base64,' + Buffer.from(doc.output('arraybuffer')).toString('base64')
    }, 'surat');
  }

  if (typeof options.seed === 'function') {
    options.seed({ visitors, meetings, sppd, visitWorkflow, masterData, rooms, previewDocument, now, currentTime, today, yesterday, tomorrow, visitDate });
  } else if (options.seed && typeof options.seed === 'object') {
    if (Array.isArray(options.seed.visitors)) visitors.push(...options.seed.visitors);
    if (Array.isArray(options.seed.meetings)) meetings.push(...options.seed.meetings);
    if (Array.isArray(options.seed.sppd)) sppd.push(...options.seed.sppd);
    if (Array.isArray(options.seed.attendance)) {
      options.seed.attendance.forEach(entry => visitWorkflow.seedAgendaAttendance(entry.rapat_id, entry.people || [entry]));
    }
  }

  function visibleVisitors() {
    return visitors.filter(item => isVisitDisplayDateOnOrAfterCutoff(item.tanggal_kunjungan));
  }

  function visibleMeetings() {
    return meetings.filter(item => item.status !== 'Dibatalkan' && isDisplayDateOnOrAfterCutoff(item.tanggal));
  }

  function visibleSppd() {
    const visitDateByCode = new Map();
    const visitDateById = new Map();
    visitors.forEach(item => {
      const dateKey = normalizeJakartaDateKey(item && item.tanggal_kunjungan);
      const codeKey = String(item && item.kode_kunjungan || '').trim();
      const idKey = String(item && item.id || '').trim();
      if (codeKey) visitDateByCode.set(codeKey, dateKey);
      if (idKey) visitDateById.set(idKey, dateKey);
    });
    return sppd.filter(item => {
      const codeKey = String(item && item.kode_kunjungan || '').trim();
      const idKey = String(item && item.tamu_id || '').trim();
      let resolvedDate = '';
      if (codeKey && visitDateByCode.has(codeKey)) {
        resolvedDate = visitDateByCode.get(codeKey);
      } else if (idKey && visitDateById.has(idKey)) {
        resolvedDate = visitDateById.get(idKey);
      } else {
        resolvedDate = parseVisitCodeDateKey(codeKey) || normalizeJakartaDateKey(item && item.waktu_persetujuan_kasubag);
      }
      return isVisitDisplayDateOnOrAfterCutoff(resolvedDate);
    });
  }

  function getStats() {
    const currentDay = jakartaDate(currentTime());
    const filteredVisitors = visibleVisitors();
    const filteredMeetings = visibleMeetings();
    const filteredSppd = visibleSppd();
    return {
      totalTamu: filteredVisitors.length,
      tamuHariIni: filteredVisitors.filter(item => normalizeJakartaDateKey(item.tanggal_kunjungan) === currentDay && isVisitDisplayDateOnOrAfterCutoff(item.tanggal_kunjungan)).length,
      tamuLuar: filteredVisitors.filter(item => item.tipe_tamu === 'luar_daerah').length,
      tamuFo: filteredVisitors.filter(item => item.tipe_tamu === 'dalam_daerah_fo').length,
      rapatHariIni: filteredMeetings.filter(item => normalizeJakartaDateKey(item.tanggal) === currentDay && item.status !== 'Ditunda').length,
      sppd: {
        total: filteredSppd.length,
        belumLengkap: filteredSppd.filter(item => item.status_sppd === 'Belum Lengkap').length,
        sah: filteredSppd.filter(item => item.status_sppd === 'Sah & Terverifikasi').length
      }
    };
  }

  function nextVisitCode(prefix, visitDateValue) {
    const compactDate = String(visitDateValue).replaceAll('-', '');
    const formattedDate = `${compactDate.slice(6, 8)}${compactDate.slice(4, 6)}${compactDate.slice(0, 4)}`;
    const monthKey = formattedDate.slice(2);
    let maxSerial = 0;

    visitors.forEach(item => {
      const match = /^(?:TLD|TDD)-(\d{8})-(\d+)$/.exec(item.kode_kunjungan || '');
      if (match && match[1].slice(2) === monthKey) {
        maxSerial = Math.max(maxSerial, Number.parseInt(match[2], 10));
      }
    });

    return `${prefix}-${formattedDate}-${String(maxSerial + 1).padStart(3, '0')}`;
  }

  function registerVisitor(functionName, payload) {
    const isFo = functionName === 'registerTamuFo';
    let destination;
    try { destination = isFo ? prepareTddVisit(payload) : prepareVisit(payload); }
    catch (error) { return { success: false, error: error.message }; }
    const submittedAt = currentTime();
    const visitDateValue = isFo ? jakartaDate(submittedAt) : payload.tanggal_kunjungan;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDateValue || '') ||
        Number.isNaN(Date.parse(visitDateValue)) ||
        new Date(visitDateValue).toISOString().slice(0, 10) !== visitDateValue) {
      return { success: false, error: 'Tanggal kunjungan tidak valid.' };
    }
    const lo = { id: destination.picIds, nama: destination.pic };
    const visitor = {
      id: Math.max(0, ...visitors.map(item => Number(item.id) || 0)) + 1,
      kode_kunjungan: nextVisitCode(isFo ? 'TDD' : 'TLD', visitDateValue),
      tipe_tamu: isFo ? 'dalam_daerah_fo' : 'luar_daerah',
      instansi: payload.instansi || (isFo ? 'Perorangan' : ''),
      alamat: payload.alamat || '',
      jumlah_orang: Number.parseInt(payload.jumlah_orang, 10) || 1,
      ketua_nama: payload.ketua_nama || '',
      pengikut_list: payload.pengikut_list || '',
      tujuan_bidang: destination.bidang,
      keperluan: payload.keperluan || '',
      narahubung_nama: payload.ketua_nama || '',
      narahubung_hp: payload.narahubung_hp || '',
      tanggal_kunjungan: visitDateValue,
      jam_kunjungan: isFo ? jakartaTime(submittedAt) : (payload.jam_kunjungan || ''),
      surat_kunjungan_file: isFo ? '' : visitWorkflow.saveFile({ name: 'Surat Kunjungan.pdf', data: payload.surat_kunjungan_base64 }, 'surat').url,
      surat_tugas_file: isFo ? '' : visitWorkflow.saveFile({ name: 'Surat Tugas.pdf', data: payload.surat_tugas_base64 }, 'surat').url,
      lo_id: lo.id,
      lo_nama: lo.nama,
      bawa_sppd: !isFo,
      status_kunjungan: isFo ? 'Non-SPPD' : 'Menunggu Konfirmasi'
    };

    visitors.unshift(visitor);
    if (!isFo) {
      sppd.push({
        id: Math.max(0, ...sppd.map(item => Number(item.id) || 0)) + 1,
        tamu_id: visitor.id,
        kode_kunjungan: visitor.kode_kunjungan,
        instansi: visitor.instansi,
        ketua_nama: visitor.ketua_nama,
        file_foto: '',
        file_absen: '',
        file_notulen: '',
        status_sppd: 'Belum Lengkap'
      });
    }
    return {
      success: true,
      message: 'Data tamu disimpan sementara di server lokal.',
      data: {
        kode_kunjungan: visitor.kode_kunjungan,
        tujuan_bidang: visitor.tujuan_bidang,
        lo_nama: visitor.lo_nama
      }
    };
  }

  return {
    responses: {
      get getDashboardData() {
        const currentDay = jakartaDate(currentTime());
        return {
          success: true,
          data: {
            stats: getStats(),
            recentTamu: visibleVisitors().slice().sort(compareVisitsDesc).slice(0, 5),
            todayMeetings: visibleMeetings().filter(item => normalizeJakartaDateKey(item.tanggal) === currentDay && item.status !== 'Ditunda'),
            loStats: []
          }
        };
      },
      get getDashboardSummary() {
        const result = this.getDashboardData;
        delete result.data.loStats;
        return result;
      },
      get getTamuList() { return { success: true, data: visibleVisitors() }; },
      get getRapatCalendar() {
        const sorted = visibleMeetings()
          .map(item => { if (!item.schedule_history) item.schedule_history = []; return item; })
          .sort((a, b) =>
            normalizeJakartaDateKey(b.tanggal).localeCompare(normalizeJakartaDateKey(a.tanggal)) ||
            String(b.jam_mulai || '').localeCompare(String(a.jam_mulai || '')) ||
            String(b.jam_selesai || '').localeCompare(String(a.jam_selesai || ''))
          );
        return { success: true, data: sorted };
      },
      get getPublicAttendanceCalendar() {
        const result = this.getRapatCalendar;
        return {
          success: true,
          data: result.data.map(m => ({
            id: m.id,
            kode_rapat: m.kode_rapat,
            kode_kunjungan: m.kode_kunjungan,
            judul_rapat: m.judul_rapat,
            nama_ruangan: m.nama_ruangan,
            tanggal: normalizeJakartaDateKey(m.tanggal) || m.tanggal,
            jam_mulai: m.jam_mulai,
            jam_selesai: m.jam_selesai,
            status: m.status,
            locked: Boolean(m.locked),
            notula: Boolean(m.notula),
            manual_attendance: Boolean(m.manual_attendance)
          }))
        };
      },
      get getSppdList() { return { success: true, data: visibleSppd() }; },
      getMasterData: { success: true, data: { ...masterData, ruangan: rooms } },
      getMeetingRoomOptions: { success: true, data: { ruangan: rooms } }
    },
    getDocument: visitWorkflow.getDocument,
    handleMutation(functionName, payload = {}) {
      const workflowResponse = visitWorkflow.handle(functionName, payload);
      if (workflowResponse) return workflowResponse;
      if (functionName === 'registerTamuFo' || functionName === 'registerTamuLuar') {
        return registerVisitor(functionName, payload);
      }
      return null;
    }
  };
}

module.exports = { createFixtureStore };
