'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');

const { createFixtureStore } = require('../fixtures');
const { createLocalTestServer } = require('../server');

const ROOT = path.join(__dirname, '../..');

function readAdminFile(name) {
  return fs.readFileSync(path.join(ROOT, 'Admin', name), 'utf8');
}

function makeSheet(rows = [], writes = []) {
  const colWidth = rows.reduce((max, row) => Math.max(max, row.length), 1);
  return {
    rows,
    getLastRow: () => rows.length + 1,
    getLastColumn: () => colWidth,
    appendRow(row) {
      writes.push({ op: 'appendRow', row });
      rows.push(Array.from(row));
    },
    deleteRow(idx) {
      writes.push({ op: 'deleteRow', idx });
    },
    getRange(row, col, count = 1, width = 1) {
      return {
        getValues: () => Array.from({ length: count }, (_, rIdx) => {
          const src = rows[row - 2 + rIdx] || [];
          return Array.from({ length: width }, (_, cIdx) => (cIdx + col - 1 < src.length ? src[col - 1 + cIdx] : ''));
        }),
        getDisplayValues: () => Array.from({ length: count }, (_, rIdx) => {
          const src = rows[row - 2 + rIdx] || [];
          return Array.from({ length: width }, (_, cIdx) => {
            const val = src[col - 1 + cIdx];
            return val === undefined || val === null ? '' : String(val);
          });
        }),
        setValue(val) {
          writes.push({ op: 'setValue', row, col, val });
        },
        setValues(vals) {
          writes.push({ op: 'setValues', row, col, vals });
        },
        clearContent() {
          writes.push({ op: 'clearContent', row, col });
        },
        setNumberFormat() {
          return this;
        }
      };
    }
  };
}

function loadGasEnv({ sheetsData, nowIso = '2026-11-04T03:00:00Z', fetchCalls = [], sheetWrites = [] }) {
  const realDate = Date;
  const fixedMs = Date.parse(nowIso);
  function MockDate(...args) {
    if (!(this instanceof MockDate)) return args.length ? new realDate(...args).toString() : new realDate(fixedMs).toString();
    return args.length ? new realDate(...args) : new realDate(fixedMs);
  }
  MockDate.now = () => fixedMs;
  MockDate.parse = realDate.parse;
  MockDate.UTC = realDate.UTC;
  MockDate.prototype = realDate.prototype;

  const sheets = {};
  for (const [name, rows] of Object.entries(sheetsData)) {
    sheets[name] = makeSheet(rows, sheetWrites);
  }

  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => sheets[name] || null
  };

  const context = vm.createContext({
    Date: MockDate,
    Intl,
    Utilities: {
      formatDate(date, tz, fmt) {
        const d = date instanceof realDate || (date && typeof date.getTime === 'function') ? date : new realDate(date);
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz || 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(d);
        const map = {};
        parts.forEach(p => { map[p.type] = p.value; });
        const hh = map.hour === '24' ? '00' : map.hour;
        if (fmt === 'yyyy-MM-dd') return `${map.year}-${map.month}-${map.day}`;
        if (fmt === 'HH:mm') return `${hh}:${map.minute}`;
        return `${map.year}-${map.month}-${map.day} ${hh}:${map.minute}:${map.second}`;
      }
    },
    UrlFetchApp: {
      fetch(url, opts) {
        fetchCalls.push({ url, opts });
        throw new Error('Network calls must not run during read flows.');
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => '' })
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put() {}, remove() {} })
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    }
  });

  const adminFiles = [
    'Code.js',
    'PublicApi.js',
    'MeetingRooms.js',
    'VisitWorkflow.js',
    'VisitWorkflowStorage.js',
    'VisitArchive.js',
    'AgendaDocuments.js',
    'AgendaAttendanceData.js',
    'VisitPicContacts.js'
  ];
  for (const file of adminFiles) {
    vm.runInContext(readAdminFile(file), context);
  }
  context.getSpreadsheet = () => ss;
  context.requireVisitAdmin_ = () => ({ email: 'admin@diskum.batam.go.id' });
  return { context, sheets };
}

test('obsolete demo files are removed and local defaults start with real config and zero dummy records', async () => {
  for (const removed of [
    'local-test/deployment-demo-builder.js',
    'local-test/deployment-fixtures.js',
    'local-test/deployment-fixture-version.json'
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, removed)), false, `${removed} should be removed`);
  }

  const store = createFixtureStore(new Date('2026-11-04T05:00:00Z'));
  const serialized = JSON.stringify([
    store.responses.getDashboardData,
    store.responses.getTamuList,
    store.responses.getRapatCalendar,
    store.responses.getSppdList
  ]);
  assert.doesNotMatch(serialized, /Purnama|Cempaka|Hendra Wijaya|Bayu Saputro|Vina Oktaviani|Rini Handayani|Ayu Kartikasari|Bimo Santosa|0800000020/i);
  assert.deepEqual(store.responses.getTamuList.data, []);
  assert.deepEqual(store.responses.getRapatCalendar.data, []);
  assert.deepEqual(store.responses.getSppdList.data, []);
  assert.deepEqual(store.responses.getDashboardData.data.stats, {
    totalTamu: 0,
    tamuHariIni: 0,
    tamuLuar: 0,
    tamuFo: 0,
    rapatHariIni: 0,
    sppd: { total: 0, belumLengkap: 0, sah: 0 }
  });
  assert.equal(store.responses.getMasterData.data.pegawai.some(p => /Rini Handayani|Bayu Saputro|Vina Oktaviani/i.test(p.nama)), false);

  const server = createLocalTestServer({ now: () => new Date('2026-11-04T05:00:00Z') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const rpc = async fn => (await fetch(`${base}/api/${fn}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })).json();
    const summary = await rpc('getDashboardSummary');
    assert.equal(summary.success, true);
    assert.equal(summary.data.stats.totalTamu, 0);
    assert.deepEqual(summary.data.recentTamu, []);
    assert.deepEqual(summary.data.todayMeetings, []);
    assert.deepEqual((await rpc('getTamuList')).data, []);
    assert.deepEqual((await rpc('getRapatCalendar')).data, []);
    assert.deepEqual((await rpc('getSppdList')).data, []);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('GAS Asia/Jakarta split cutoff keeps Buku Tamu/SPPD >= Nov 5 and Agenda/Presensi/E-Notula >= Nov 2 without mutating historical data', () => {
  const visitRow = (id, code, tipe, instansi, tanggal, jam, status) => {
    const row = Array(21).fill('');
    row[0] = id; row[1] = code; row[2] = tipe; row[3] = instansi; row[4] = 'Batam';
    row[5] = 2; row[6] = `Ketua ${id}`; row[7] = `Anggota ${id}`; row[8] = 'Sekretariat';
    row[9] = `Keperluan ${id}`; row[10] = `Ketua ${id}`; row[11] = '081200000000';
    row[12] = tanggal; row[13] = jam; row[17] = 'PIC Diskum'; row[18] = tipe === 'luar_daerah' ? 1 : 0;
    row[19] = status; row[20] = '2026-11-05 08:00:00';
    return row;
  };
  const meetingRow = (id, kode, judul, tanggal, jamMulai, jamSelesai, status) => ([
    id, kode, judul, 1, 'Ruang Rapat Utama Diskum', tanggal, jamMulai, jamSelesai,
    'Sekretariat', 'Pimpinan', 5, 'Agenda', status, '2026-11-02 08:00:00'
  ]);
  const sppdRow = (id, tamuId, code, instansi, status) => ([
    id, tamuId, code, instansi, `Ketua ${tamuId}`, '', '', '', status, '', '', '', '', '', '', '', '2026-11-04 08:00:00'
  ]);

  const rawTamu = [
    visitRow(1, 'TLD-01112026-001', 'luar_daerah', 'Instansi Oct', '2026-11-01', '09:00', 'Menunggu Konfirmasi'),
    visitRow(2, 'TDD-02112026-018', 'dalam_daerah_fo', 'Uji Coba Nov 2', '2026-11-02', '09:00', 'Non-SPPD'),
    visitRow(3, 'TLD-04112026-002', 'luar_daerah', 'Instansi UTC Sebelum Nov 5', '2026-11-04T16:59:59Z', '10:00', 'Menunggu Konfirmasi'),
    visitRow(4, 'TDD-04112026-003', 'dalam_daerah_fo', 'Instansi Date Sebelum Nov 5', new Date('2026-11-04T16:59:59Z'), '11:00', 'Non-SPPD'),
    visitRow(5, 'TLD-05112026-001', 'luar_daerah', 'Instansi UTC Midnight Nov 5 WIB', '2026-11-04T17:00:00Z', '08:00', 'Kelola SPPD'),
    visitRow(6, 'TDD-05112026-002', 'dalam_daerah_fo', 'Instansi Date Nov 5 Cutoff', new Date('2026-11-04T17:00:00Z'), '09:00', 'Non-SPPD'),
    visitRow(7, 'TLD-31102026-099', 'luar_daerah', 'Instansi Dijadwal Ulang Ke Nov 6', '2026-11-06', '10:00', 'Selesai'),
    visitRow(8, 'TDD-06112026-004', 'dalam_daerah_fo', 'Instansi Hari Ini 2', '06-11-2026', '13:00', 'Non-SPPD'),
    visitRow(9, 'TLD-07112026-005', 'luar_daerah', 'Instansi Masa Depan', '2026-11-07', '14:00', 'Menunggu Konfirmasi'),
    visitRow(10, 'TDD-08112026-006', 'dalam_daerah_fo', 'Instansi Nov 8', '2026-11-08', '15:00', 'Non-SPPD'),
    visitRow(11, 'TLD-EMPTY-007', 'luar_daerah', 'Tanpa Tanggal', '', '09:00', 'Menunggu Konfirmasi')
  ];
  const rawRapat = [
    meetingRow(11, 'RPT-11', 'Rapat Sebelum Nov 2', '2026-11-01', '09:00', '10:00', 'Terjadwal'),
    meetingRow(12, 'RPT-12', 'Rapat UTC Sebelum Cutoff', '2026-11-01T16:59:59Z', '10:00', '11:00', 'Terjadwal'),
    meetingRow(13, 'RPT-13', 'Rapat UTC Midnight Nov 2 WIB', '2026-11-01T17:00:00Z', '09:00', '10:00', 'Terjadwal'),
    meetingRow(14, 'RPT-14', 'Rapat Nov 4 Tetap Tampil', '2026-11-04', '10:00', '12:00', 'Terjadwal'),
    meetingRow(15, 'RPT-15', 'Rapat Hari Ini Aktif', '2026-11-06', '10:00', '12:00', 'Terjadwal'),
    meetingRow(16, 'RPT-16', 'Rapat Hari Ini Ditunda', '2026-11-06', '13:00', '14:00', 'Ditunda'),
    meetingRow(17, 'RPT-17', 'Rapat Hari Ini Batal', '2026-11-06', '15:00', '16:00', 'Dibatalkan')
  ];
  const rawSppd = [
    sppdRow(21, 1, 'TLD-01112026-001', 'Instansi Oct', 'Belum Lengkap'),
    sppdRow(22, 3, 'TLD-04112026-002', 'Instansi UTC Sebelum Nov 5', 'Sah & Terverifikasi'),
    sppdRow(23, 5, 'TLD-05112026-001', 'Instansi UTC Midnight Nov 5 WIB', 'Belum Lengkap'),
    sppdRow(24, 7, 'TLD-31102026-099', 'Instansi Dijadwal Ulang Ke Nov 6', 'Sah & Terverifikasi'),
    sppdRow(25, 9, 'TLD-07112026-005', 'Instansi Masa Depan', 'Menunggu Validasi Teknis')
  ];
  const rawPresensi = [
    [1, 11, 'RPT-11', 'Diskum', 'Peserta Pra Cutoff', '-', 'Staf', 'Diskum', '', '2026-11-01 09:10:00', '', 'QR', ''],
    [2, 13, 'RPT-13', 'Diskum', 'Presensi Nyasar Okt', '-', 'Staf', 'Diskum', '', '2026-11-01T16:59:59Z', '', 'QR', ''],
    [3, 13, 'RPT-13', 'Diskum', 'Presensi Midnight Nov 2 WIB', '-', 'Staf', 'Diskum', '', '2026-11-01T17:00:00Z', '', 'QR', ''],
    [4, 14, 'RPT-14', 'OPD_Pemko', 'Peserta Nov 4 Aktif', '-', 'Kabid', 'Dinas Sosial', '', '2026-11-04 10:15:00', '', 'QR', '']
  ];

  const tamuSnapshot = rawTamu.length;
  const rapatSnapshot = rawRapat.length;
  const sppdSnapshot = rawSppd.length;
  const fetchCalls = [];
  const sheetWrites = [];

  const { context, sheets } = loadGasEnv({
    nowIso: '2026-11-06T03:00:00Z', // 2026-11-06 10:00 WIB
    fetchCalls,
    sheetWrites,
    sheetsData: {
      Data_Tamu: rawTamu,
      Data_Rapat: rawRapat,
      Kendali_SPPD: rawSppd,
      Data_Presensi: rawPresensi,
      Master_Ruangan: [[1, 'Ruang Rapat Utama Diskum', 50]],
      Master_Pegawai: [],
      Master_OPD: []
    }
  });

  // 1. Tamu list excludes < Nov 5 (including Nov 2 trial & Nov 4) and blank dates, converts TZ-aware strings cleanly
  const tamuList = context.getTamuList();
  assert.equal(tamuList.success, true);
  assert.deepEqual(Array.from(tamuList.data, v => v.id), [5, 6, 7, 8, 9, 10]);
  assert.equal(tamuList.data.find(v => v.id === 5).tanggal_kunjungan, '2026-11-05');
  assert.equal(tamuList.data.find(v => v.id === 8).tanggal_kunjungan, '2026-11-06');

  // 2. Dashboard KPI counts and recentTamu/todayMeetings reconcile 100% with split cutoffs
  const dashboard = context.getDashboardData();
  const summary = context.getDashboardSummary();
  assert.equal(dashboard.success, true);
  assert.equal(summary.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(dashboard.data.stats)), {
    totalTamu: 6,       // IDs 5,6,7,8,9,10 (>= Nov 5)
    tamuHariIni: 2,     // IDs 7,8 (both 2026-11-06)
    tamuLuar: 3,        // IDs 5,7,9
    tamuFo: 3,          // IDs 6,8,10
    rapatHariIni: 1,    // ID 15 only (16 is Ditunda, 17 is Dibatalkan)
    sppd: {
      total: 3,         // SPPD IDs 23, 24 (linked to Nov 6 rescheduled visit), 25
      belumLengkap: 1,  // ID 23
      sah: 1            // ID 24
    }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(summary.data.stats)), JSON.parse(JSON.stringify(dashboard.data.stats)));
  assert.deepEqual(Array.from(dashboard.data.recentTamu, v => v.id), [10, 9, 8, 7, 6]);
  assert.deepEqual(Array.from(dashboard.data.todayMeetings, m => m.id), [15]);

  // 3. SPPD list aligns identically with Dashboard SPPD stats (>= Nov 5)
  const sppdList = context.getSppdList();
  assert.equal(sppdList.success, true);
  assert.deepEqual(Array.from(sppdList.data, s => s.id), [23, 24, 25]);

  // 4. Rapat calendar & Public attendance calendar keep >= Nov 2 (including Nov 2–4!) and exclude < Nov 2 and Dibatalkan
  const cal = context.getRapatCalendar();
  const pubCal = context.getPublicAttendanceCalendar();
  assert.deepEqual(Array.from(cal.data, m => m.id), [16, 15, 14, 13]);
  assert.deepEqual(Array.from(pubCal.data, m => m.id), [16, 15, 14, 13]);
  assert.equal(cal.data.find(m => m.id === 13).tanggal, '2026-11-02');
  assert.equal(cal.data.find(m => m.id === 14).tanggal, '2026-11-04');

  // 5. Attendance viewer rejects pre-Nov-2 agenda & pre-Nov-2 attendance rows, keeps Nov 2–4 agendas
  assert.equal(context.getAgendaAttendance({ rapat_id: 11 }).success, false);
  assert.equal(context.getAgendaAttendance({ rapat_id: 12 }).success, false);
  const att13 = context.getAgendaAttendance({ rapat_id: 13 });
  assert.equal(att13.success, true, att13.error);
  assert.deepEqual(Array.from(att13.data.attendance, a => a.nama), ['Presensi Midnight Nov 2 WIB']);
  const att14 = context.getAgendaAttendance({ rapat_id: 14 });
  assert.equal(att14.success, true, att14.error);
  assert.deepEqual(Array.from(att14.data.attendance, a => a.nama), ['Peserta Nov 4 Aktif']);

  // 6. E-Notula context rejects pre-Nov-2 agenda and succeeds for >= Nov 2 (Nov 2 & Nov 4)
  assert.equal(context.getAgendaNotulaContext({ rapat_id: 11 }).success, false);
  assert.equal(context.getAgendaNotulaContext({ rapat_id: 13 }).success, true);
  assert.equal(context.getAgendaNotulaContext({ rapat_id: 14 }).success, true);

  // 7. Historical rows preserved intact, zero sheet writes, zero WhatsApp/HTTP sends
  assert.equal(sheets.Data_Tamu.rows.length, tamuSnapshot);
  assert.equal(sheets.Data_Rapat.rows.length, rapatSnapshot);
  assert.equal(sheets.Kendali_SPPD.rows.length, sppdSnapshot);
  assert.equal(sheetWrites.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('local HTTP server applies the same split cutoff (Nov 5 visits/SPPD, Nov 2 agendas/attendance) across all read endpoints with zero network calls', async () => {
  const server = createLocalTestServer({
    now: () => new Date('2026-11-06T03:00:00Z'),
    seed: {
      visitors: [
        { id: 1, kode_kunjungan: 'TDD-02112026-018', tipe_tamu: 'dalam_daerah_fo', instansi: 'Trial Nov 2', tanggal_kunjungan: '2026-11-02', jam_kunjungan: '09:00', bawa_sppd: false, status_kunjungan: 'Non-SPPD' },
        { id: 2, kode_kunjungan: 'TLD-04112026-001', tipe_tamu: 'luar_daerah', instansi: 'Pra Nov 5', tanggal_kunjungan: '2026-11-04', jam_kunjungan: '09:00', bawa_sppd: true, status_kunjungan: 'Menunggu Konfirmasi' },
        { id: 3, kode_kunjungan: 'TLD-05112026-002', tipe_tamu: 'luar_daerah', instansi: 'UTC Midnight Nov 5 WIB', tanggal_kunjungan: '2026-11-04T17:00:00Z', jam_kunjungan: '00:05', bawa_sppd: true, status_kunjungan: 'Menunggu Konfirmasi' },
        { id: 4, kode_kunjungan: 'TDD-06112026-003', tipe_tamu: 'dalam_daerah_fo', instansi: 'FO Hari Ini', tanggal_kunjungan: '2026-11-06', jam_kunjungan: '10:00', bawa_sppd: false, status_kunjungan: 'Non-SPPD' }
      ],
      meetings: [
        { id: 10, kode_rapat: 'RPT-10', judul_rapat: 'Rapat Lama', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-01', jam_mulai: '09:00', jam_selesai: '10:00', status: 'Terjadwal' },
        { id: 11, kode_rapat: 'RPT-11', judul_rapat: 'Rapat Nov 2 Tetap Aktif', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '10:00', status: 'Terjadwal' },
        { id: 12, kode_rapat: 'RPT-12', judul_rapat: 'Rapat Hari Ini', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-06', jam_mulai: '09:00', jam_selesai: '10:00', status: 'Terjadwal' }
      ],
      sppd: [
        { id: 30, tamu_id: 2, kode_kunjungan: 'TLD-04112026-001', instansi: 'Pra Nov 5', ketua_nama: 'A', status_sppd: 'Belum Lengkap' },
        { id: 31, tamu_id: 3, kode_kunjungan: 'TLD-05112026-002', instansi: 'UTC Midnight Nov 5 WIB', ketua_nama: 'B', status_sppd: 'Sah & Terverifikasi' }
      ],
      attendance: [
        { rapat_id: 10, people: [{ id: 1, kategori: 'Diskum', nama: 'Peserta Lama', waktu: '2026-11-01 09:05:00' }] },
        { rapat_id: 11, people: [
          { id: 2, kategori: 'Diskum', nama: 'Peserta Straggler', waktu: '2026-11-01T16:59:59Z' },
          { id: 3, kategori: 'Diskum', nama: 'Peserta Sah Nov 2', waktu: '2026-11-01T17:00:00Z' }
        ] }
      ]
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const rpc = async (fn, body = {}) => (await fetch(`${base}/api/${fn}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })).json();

    const summary = await rpc('getDashboardSummary');
    assert.deepEqual(summary.data.stats, {
      totalTamu: 2,
      tamuHariIni: 1,
      tamuLuar: 1,
      tamuFo: 1,
      rapatHariIni: 1,
      sppd: { total: 1, belumLengkap: 0, sah: 1 }
    });
    assert.deepEqual(Array.from((await rpc('getTamuList')).data, v => v.id), [3, 4]);
    assert.deepEqual(Array.from((await rpc('getRapatCalendar')).data, m => m.id), [12, 11]);
    assert.deepEqual(Array.from((await rpc('getPublicAttendanceCalendar')).data, m => m.id), [12, 11]);
    assert.deepEqual(Array.from((await rpc('getSppdList')).data, s => s.id), [31]);
    assert.equal((await rpc('getAgendaAttendance', { rapat_id: 10 })).success, false);
    assert.deepEqual(Array.from((await rpc('getAgendaAttendance', { rapat_id: 11 })).data.attendance, a => a.nama), ['Peserta Sah Nov 2']);
    assert.equal((await rpc('getAgendaNotulaContext', { rapat_id: 10 })).success, false);
    assert.equal((await rpc('getAgendaNotulaContext', { rapat_id: 11 })).success, true);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('Admin UI shows proper empty states and resets KPI stats on summary failure without fabricated data', () => {
  const html = readAdminFile('Index.html');
  const elements = {};
  for (const id of [
    'statTamuHariIni', 'statTotalTamu', 'statTamuLuar', 'statTamuFo',
    'statRapatHariIni', 'statSppdBelumLengkap', 'statSppdSah',
    'todayMeetingsList', 'recentTamuTableBody'
  ]) {
    elements[id] = { innerText: '99', innerHTML: '<li>stale</li>' };
  }

  const panelStates = [];
  const tableStates = [];
  const toasts = [];
  const pending = [];

  const ctx = vm.createContext({
    console: { error() {}, warn() {} },
    document: { getElementById: id => elements[id] || null },
    callBackend: (name, args, ok, error) => pending.push({ name, ok, error }),
    renderPanelState: (el, type, msg) => panelStates.push({ el, type, msg }),
    renderTableState: (el, cols, type, msg) => tableStates.push({ el, cols, type, msg }),
    responseMessage: (res, fallback) => (res && res.error) || fallback,
    showToast: (type, title, msg) => toasts.push({ type, title, msg }),
    mergeVisitPatches: rows => rows,
    renderVisitRow: () => '<tr></tr>',
    renderTamuTable() {},
    renderMonthlyReport() {},
    refreshVisitSummary() {},
    refreshVisitCalendar() {}
  });

  vm.runInContext('let allTamuData=[],allRapatData=[],visitListRevision=0,visitListPatches=new Map(),dashboardRequestRevision=0,calendarRequestRevision=0;', ctx);
  for (const fnName of ['resetDashboardStats', 'loadAllDashboard', 'renderTodayMeetings', 'renderRecentTamu']) {
    const match = html.match(new RegExp('    function ' + fnName + '\\([^]*?\\n    \\}'));
    assert.ok(match, `Missing ${fnName} in Admin/Index.html`);
    vm.runInContext(match[0], ctx);
  }

  // Empty states show explicit messages, never dummy records
  ctx.renderTodayMeetings([]);
  ctx.renderRecentTamu([]);
  assert.equal(panelStates.at(-1).type, 'empty');
  assert.match(panelStates.at(-1).msg, /Belum ada rapat/i);
  assert.equal(tableStates.at(-1).type, 'empty');
  assert.match(tableStates.at(-1).msg, /Belum ada kunjungan/i);

  // API failure (res.success === false) resets all 7 counters and displays error state
  ctx.loadAllDashboard({ summary: true, visitors: false, calendar: false });
  pending[0].ok({ success: false, error: 'Gagal baca Google Sheets' });
  for (const statId of ['statTamuHariIni', 'statTotalTamu', 'statTamuLuar', 'statTamuFo', 'statRapatHariIni', 'statSppdBelumLengkap', 'statSppdSah']) {
    assert.equal(elements[statId].innerText, '—', `${statId} should reset on error`);
  }
  assert.equal(panelStates.at(-1).type, 'error');
  assert.equal(tableStates.at(-1).type, 'error');

  // Network error also resets all 7 counters and shows error toast
  for (const statId of ['statTamuHariIni', 'statTotalTamu', 'statTamuLuar', 'statTamuFo', 'statRapatHariIni', 'statSppdBelumLengkap', 'statSppdSah']) {
    elements[statId].innerText = '42';
  }
  ctx.loadAllDashboard({ summary: true, visitors: false, calendar: false });
  pending[1].error(new Error('Network down'));
  for (const statId of ['statTamuHariIni', 'statTotalTamu', 'statTamuLuar', 'statTamuFo', 'statRapatHariIni', 'statSppdBelumLengkap', 'statSppdSah']) {
    assert.equal(elements[statId].innerText, '—', `${statId} should reset on network error`);
  }
  assert.equal(toasts.at(-1).type, 'error');
});
