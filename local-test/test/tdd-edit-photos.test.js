'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer, renderAdminHtml } = require('../server');
const { createVisitWorkflow } = require('../visit-workflow');
const { completeTddPayload } = require('./tdd-test-data');

const root = path.resolve(__dirname, '../..');
const SAMPLE_JPG = 'data:image/jpeg;base64,/9j/2Q==';
const SAMPLE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const SAMPLE_PDF = 'data:application/pdf;base64,JVBERg==';

function extractFn(source, name) {
  const match = source.match(new RegExp(`    (?:async\\s+)?function ${name}\\([^]*?\\n    \\}`));
  assert.ok(match, `Expected function ${name} in source`);
  return match[0];
}

function createHeaderSheet(headers, initialRows = []) {
  const rows = [headers.slice(), ...initialRows.map(r => r.slice())];
  const reads = [];
  return {
    rows,
    reads,
    getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : headers.length),
    appendRow: row => rows.push(Array.from(row)),
    getRange: (r, c, n = 1, w = 1) => ({
      getValues: () => {
        reads.push({ row: r, col: c, count: n, width: w });
        return rows.slice(r - 1, r - 1 + n).map(row => Array.from({ length: w }, (_, j) => row[c - 1 + j] ?? ''));
      },
      getDisplayValues: () => rows.slice(r - 1, r - 1 + n).map(row => Array.from({ length: w }, (_, j) => String(row[c - 1 + j] ?? ''))),
      setValues: values => values.forEach((vals, i) => {
        const idx = r - 1 + i;
        while (rows.length <= idx) rows.push([]);
        vals.forEach((v, j) => { rows[idx][c - 1 + j] = v; });
      }),
      setValue: val => {
        const idx = r - 1;
        while (rows.length <= idx) rows.push([]);
        rows[idx][c - 1] = val;
      },
      setNumberFormat() { return this; }
    })
  };
}

function createGasHarness({ initialVisitors = [], initialMeetings = [], initialPhotos = [], isAdmin = true } = {}) {
  const sheets = new Map();
  const tamuHeaders = [
    'ID', 'Kode_Kunjungan', 'Tipe_Tamu', 'Instansi', 'Alamat', 'Jumlah_Orang',
    'Ketua_Nama', 'Pengikut_List', 'Tujuan_Bidang', 'Keperluan',
    'Narahubung_Nama', 'Narahubung_HP', 'Tanggal_Kunjungan', 'Jam_Kunjungan',
    'URL_Surat_Kunjungan', 'URL_Surat_Tugas', 'LO_ID', 'LO_Nama', 'Bawa_SPPD',
    'Status_Kunjungan', 'Timestamp'
  ];
  const rapatHeaders = [
    'ID', 'Kode_Rapat', 'Judul_Rapat', 'Ruangan_ID', 'Nama_Ruangan',
    'Tanggal', 'Jam_Mulai', 'Jam_Selesai', 'Bidang_Penyelenggara',
    'Pimpinan_Rapat', 'Jumlah_Peserta', 'Agenda', 'Status', 'Timestamp'
  ];
  const roomHeaders = ['ID', 'Nama Ruangan', 'Kapasitas', 'Fasilitas', 'Lokasi', 'Warna_Hex'];

  sheets.set('Data_Tamu', createHeaderSheet(tamuHeaders, initialVisitors));
  sheets.set('Data_Rapat', createHeaderSheet(rapatHeaders, initialMeetings));
  sheets.set('Master_Ruangan', createHeaderSheet(roomHeaders, [
    [6001, 'Ruang Rapat Utama Diskum', 50, 'Proyektor', 'Lantai 1', 'blue'],
    [6002, 'Ruangan Bidang Koperasi & UMKM', 3, 'TV', 'Lantai 1', 'emerald']
  ]));
  if (initialPhotos.length) {
    sheets.set('Foto_Agenda', createHeaderSheet(['Agenda ID', 'Foto JSON', 'Diperbarui'], initialPhotos));
  }

  let sheetReads = 0;
  let driveSerial = 0;
  const driveWrites = [];
  const driveFiles = new Map();

  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => {
      sheetReads++;
      return sheets.get(name) || null;
    },
    insertSheet: name => {
      const sheet = createHeaderSheet(['Agenda ID', 'Foto JSON', 'Diperbarui'], []);
      // insertSheet in AgendaDocuments immediately calls appendRow(headers), so start empty
      sheet.rows.length = 0;
      sheets.set(name, sheet);
      return sheet;
    }
  };

  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: (date, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd HH:mm:ss') return '2026-11-11 10:00:00';
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone: tz || 'Asia/Jakarta',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(date);
      },
      base64Encode: bytes => Buffer.from(bytes).toString('base64')
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFileById: id => {
        const stored = driveFiles.get(id);
        if (!stored) throw new Error('File not found: ' + id);
        return {
          getName: () => stored.name,
          getBlob: () => ({
            getContentType: () => stored.mime,
            getBytes: () => stored.bytes
          })
        };
      }
    }
  });

  for (const file of ['MeetingRooms.js', 'VisitWorkflow.js', 'VisitWorkflowStorage.js', 'VisitArchive.js', 'Code.js', 'AgendaDocuments.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => ss;
  context.autoSortAllSheets = () => {};
  context.autoSortRapat = () => {};
  context.requireVisitAdmin_ = () => {
    if (!isAdmin) throw new Error('Akun ini belum diberi akses admin.');
  };
  context.getApprovalActor_ = () => 'admin@diskum.batam.go.id';
  context.saveVisitWorkflowFile_ = (file, code, kind) => {
    const info = context.validateVisitFile_(file);
    const id = `file-${++driveSerial}`;
    const bytes = Buffer.from(file.data.split(',')[1], 'base64');
    driveFiles.set(id, { name: file.name || `${kind}.jpg`, mime: info.mime, bytes });
    driveWrites.push({ id, file, code, kind });
    return {
      name: file.name || `${kind}.jpg`,
      url: `https://drive.google.com/file/d/${id}/view`,
      mime: info.mime,
      size: info.size
    };
  };

  return { context, sheets, driveWrites, driveFiles, getSheetReads: () => sheetReads };
}

test('Buku Tamu renders enabled EDIT for modern and legacy TDD entries while keeping Dashboard Detail read-only and TLD intact', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const ctx = vm.createContext({
    escapeHtml: v => String(v ?? ''),
    formatVisitDateCompact: v => v
  });
  for (const fn of ['renderBidangBadges', 'getVisitStatus', 'renderVisitStatus', 'isTddVisit', 'renderVisitRow']) {
    vm.runInContext(extractFn(html, fn), ctx);
  }

  const modernTdd = {
    kode_kunjungan: 'TDD-11112026-001', tipe_tamu: 'dalam_daerah_fo',
    instansi: 'Koperasi Tunas', alamat: 'Batam', jumlah_orang: 2,
    ketua_nama: 'Aulia', tujuan_bidang: 'Bidang Pengawasan Koperasi',
    keperluan: 'Konsultasi', narahubung_hp: '0800000001',
    tanggal_kunjungan: '2026-11-11', jam_kunjungan: '10:00',
    lo_nama: 'PIC A', bawa_sppd: false, status_kunjungan: 'Non-SPPD'
  };
  const legacyTddDiterima = { ...modernTdd, kode_kunjungan: 'TDD-01102026-002', pengikut_list: '', status_kunjungan: 'Diterima' };
  const legacyTmFo = { ...modernTdd, kode_kunjungan: 'TM-FO-20261002-003', tipe_tamu: '', status_kunjungan: '' };
  const tldPending = { ...modernTdd, kode_kunjungan: 'TLD-11112026-004', tipe_tamu: 'luar_daerah', bawa_sppd: true, status_kunjungan: 'Menunggu Konfirmasi' };
  const nonTddNonSppd = { ...modernTdd, kode_kunjungan: 'EXT-001', tipe_tamu: 'other', bawa_sppd: false, status_kunjungan: 'Non-SPPD' };

  for (const tdd of [modernTdd, legacyTddDiterima, legacyTmFo]) {
    const rowHtml = ctx.renderVisitRow(tdd, false);
    assert.match(rowHtml, /onclick="openTddEdit\(this\.dataset\.kode\)"/);
    assert.doesNotMatch(rowHtml, /<button type="button" disabled/);
    const recentHtml = ctx.renderVisitRow(tdd, true);
    assert.match(recentHtml, /openRecentVisitDetail\(this\.dataset\.kode,this\.dataset\.readonly === 'true'\)/);
    assert.match(recentHtml, /data-readonly="true"/);
  }

  const tldRowHtml = ctx.renderVisitRow(tldPending, false);
  assert.match(tldRowHtml, /onclick="openVisitWorkflow\(this\.dataset\.kode\)"/);
  assert.doesNotMatch(tldRowHtml, /openTddEdit/);

  const nonTddHtml = ctx.renderVisitRow(nonTddNonSppd, false);
  assert.match(nonTddHtml, /<button type="button" disabled/);
});

test('GAS TDD without agenda allows photo uploads, preview/download, enforces limits, supports legacy TDD, and rejects TLD or unauthorized callers', () => {
  const tddRow = [
    1, 'TDD-11112026-001', 'dalam_daerah_fo', 'Perorangan', 'Batam Centre', 2,
    'Siti Rahma', 'Siti Rahma\nBudi', 'Bidang Pengawasan Koperasi', 'Konsultasi koperasi',
    'Siti Rahma', '080000000111', '2026-11-11', '09:30', '', '',
    'pengawasan-koperasi', 'Mery Sefina Simor, S.Kom.', 0, 'Diterima', '2026-11-11 09:30:00'
  ];
  const legacyTmFoRow = [
    2, 'TM-FO-20261001-001', '', 'Koperasi Lama', '', 1,
    'Tamu Lama', '', '', 'Konsultasi lama',
    'Tamu Lama', '080000000112', '2026-10-01', '10:00', '', '',
    '', '', 0, 'Diterima', '2026-10-01 10:00:00'
  ];
  const tldRow = [
    3, 'TLD-11112026-002', 'luar_daerah', 'Dinas Koperasi Luar', 'Jl. Merdeka', 3,
    'Ketua Luar', 'Ketua Luar\nAnggota', 'Bidang Pengawasan Koperasi', 'Koordinasi',
    'Ketua Luar', '080000000113', '2026-11-11', '11:00', '', '',
    'pengawasan-koperasi', 'Mery Sefina Simor, S.Kom.', 1, 'Menunggu Konfirmasi', '2026-11-11 08:00:00'
  ];

  // Unauthenticated access rejected before any sheet read; scheduling endpoint removed
  const unauth = createGasHarness({ initialVisitors: [tddRow], isAdmin: false });
  assert.equal(typeof unauth.context.scheduleTddAgenda, 'undefined');
  assert.equal(typeof unauth.context.tddAgendaTitle_, 'undefined');
  assert.equal(unauth.context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' }).success, false);
  assert.equal(unauth.context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: [{ name: 'a.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(unauth.context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-001', index: 0 }).success, false);
  assert.equal(unauth.getSheetReads(), 0);

  const { context, sheets, driveWrites } = createGasHarness({
    initialVisitors: [tddRow, legacyTmFoRow, tldRow],
    isAdmin: true
  });

  // TLD must be rejected by TDD endpoints
  assert.equal(context.getTddVisitEdit({ kode_kunjungan: 'TLD-11112026-002' }).success, false);
  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TLD-11112026-002', files: [{ name: 'a.jpg', data: SAMPLE_JPG }] }).success, false);

  // Unscheduled TDD loads cleanly with empty agenda & photos and without room-dropdown overhead
  const initialEdit = context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' });
  assert.equal(initialEdit.success, true, initialEdit.error);
  assert.equal(initialEdit.data.agenda, null);
  assert.equal(initialEdit.data.locked, false);
  assert.deepEqual(Array.from(initialEdit.data.photos), []);
  assert.equal(initialEdit.data.rooms, undefined);

  // Non-image upload & >5 batch rejected without Drive write
  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: [{ name: 'doc.pdf', data: SAMPLE_PDF }] }).success, false);
  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: Array.from({ length: 6 }, (_, i) => ({ name: `p${i}.jpg`, data: SAMPLE_JPG })) }).success, false);
  assert.equal(driveWrites.length, 0);

  // Valid unscheduled batch upload (2 photos, even with same camera filename) persists in Foto_Agenda under VISIT- key
  const uploadRes = context.saveTddPhotos({
    kode_kunjungan: 'TDD-11112026-001',
    files: [
      { name: 'camera.jpg', data: SAMPLE_JPG },
      { name: 'camera.jpg', data: SAMPLE_PNG }
    ]
  });
  assert.equal(uploadRes.success, true, uploadRes.error);
  assert.equal(uploadRes.data.photos.length, 2);
  assert.equal(uploadRes.data.photos[0].label, 'Foto Agenda Kunjungan');
  assert.equal(driveWrites.length, 2);
  assert.equal(driveWrites[0].kind, 'foto-kunjungan');
  assert.equal(sheets.get('Data_Rapat').rows.length, 1, 'no agenda created');
  assert.equal(sheets.get('Foto_Agenda').rows[1][0], 'VISIT-TDD-11112026-001');

  // Preview/download works without an agenda
  const dl0 = context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-001', index: 0 });
  const dl1 = context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-001', index: 1 });
  assert.equal(dl0.success, true, dl0.error);
  assert.equal(dl0.data.mime, 'image/jpeg');
  assert.equal(dl1.success, true, dl1.error);
  assert.equal(dl1.data.mime, 'image/png');

  // 10-photo limit enforced cleanly without an agenda
  assert.equal(context.saveTddPhotos({
    kode_kunjungan: 'TDD-11112026-001',
    files: Array.from({ length: 5 }, (_, i) => ({ name: `b${i}.jpg`, data: SAMPLE_JPG }))
  }).success, true);
  assert.equal(context.saveTddPhotos({
    kode_kunjungan: 'TDD-11112026-001',
    files: Array.from({ length: 3 }, (_, i) => ({ name: `c${i}.jpg`, data: SAMPLE_JPG }))
  }).success, true);
  assert.equal(context.saveTddPhotos({
    kode_kunjungan: 'TDD-11112026-001',
    files: [{ name: 'over.jpg', data: SAMPLE_JPG }]
  }).success, false);
  assert.equal(context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' }).data.photos.length, 10);

  // Legacy TM-FO record (empty tipe_tamu, empty pengikut_list, empty bidang) supports unscheduled upload & download
  const legacyUpload = context.saveTddPhotos({ kode_kunjungan: 'TM-FO-20261001-001', files: [{ name: 'legacy.jpg', data: SAMPLE_JPG }] });
  assert.equal(legacyUpload.success, true, legacyUpload.error);
  assert.equal(legacyUpload.data.photos.length, 1);
  assert.equal(context.getTddPhotoDocument({ kode_kunjungan: 'TM-FO-20261001-001', index: 0 }).success, true);
});

test('GAS preserves previously scheduled VISIT-TDD agendas, synchronizes shared photos bidirectionally, and enforces lock from both interfaces', () => {
  const tddRow = [
    1, 'TDD-11112026-001', 'dalam_daerah_fo', 'Koperasi Maju Bersama', 'Jl. Engku Putri', 6,
    'Rina Marlina', 'Rina Marlina\nDewi\nBudi\nAdi\nEka\nSari', 'Bidang Pengawasan Koperasi', 'Konsultasi kelembagaan',
    'Rina Marlina', '080000000111', '2026-11-11', '09:00', '', '',
    'pengawasan-koperasi', 'Mery Sefina Simor, S.Kom.', 0, 'Non-SPPD', '2026-11-11 08:30:00'
  ];
  const previouslyScheduledTdd = [
    11, 'VISIT-TDD-11112026-001', 'Kunjungan Koperasi Maju Bersama', 6001, 'Ruang Rapat Utama Diskum',
    '2026-11-12', '10:00', '11:30', 'Bidang Pengawasan Koperasi', 'Mery Sefina Simor, S.Kom.', 6, 'Konsultasi kelembagaan', 'Terjadwal', '2026-11-11 08:45:00'
  ];
  const preExistingVisitPhotos = [
    'VISIT-TDD-11112026-001',
    JSON.stringify([
      { name: 'pre1.jpg', url: 'https://drive.google.com/file/d/pre-1/view', mime: 'image/jpeg', label: 'Foto Agenda Kunjungan' },
      { name: 'pre2.jpg', url: 'https://drive.google.com/file/d/pre-2/view', mime: 'image/jpeg', label: 'Foto Agenda Kunjungan' },
      { name: 'pre3.png', url: 'https://drive.google.com/file/d/pre-3/view', mime: 'image/png', label: 'Foto Agenda Kunjungan' }
    ]),
    '2026-11-11T08:40:00Z'
  ];
  const { context, driveWrites, driveFiles } = createGasHarness({
    initialVisitors: [tddRow],
    initialMeetings: [previouslyScheduledTdd],
    initialPhotos: [preExistingVisitPhotos]
  });
  for (const [id, name, mime] of [['pre-1', 'pre1.jpg', 'image/jpeg'], ['pre-2', 'pre2.jpg', 'image/jpeg'], ['pre-3', 'pre3.png', 'image/png']]) {
    driveFiles.set(id, { name, mime, bytes: Buffer.from([1, 2, 3]) });
  }

  // 1. Existing linked agenda exposes pre-existing photos without duplicates
  let tddEdit = context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' });
  assert.equal(tddEdit.success, true, tddEdit.error);
  assert.equal(tddEdit.data.agenda.id, 11);
  assert.deepEqual(Array.from(tddEdit.data.photos, p => p.name), ['pre1.jpg', 'pre2.jpg', 'pre3.png']);
  let calAgenda = context.getRapatCalendar().data.find(m => m.id === 11);
  assert.deepEqual(Array.from(calAgenda.photos, p => p.name), ['pre1.jpg', 'pre2.jpg', 'pre3.png']);

  // 2. Upload 4 photos from Jadwal Rapat Edit -> visible in Buku Tamu Edit
  const rapatUpload = context.saveAgendaPhotos({
    rapat_id: 11,
    files: [
      { name: 'rapat1.jpg', data: SAMPLE_JPG },
      { name: 'rapat2.jpg', data: SAMPLE_JPG },
      { name: 'rapat3.jpg', data: SAMPLE_JPG },
      { name: 'rapat4.jpg', data: SAMPLE_JPG }
    ]
  });
  assert.equal(rapatUpload.success, true, rapatUpload.error);
  assert.equal(rapatUpload.data.length, 7);

  tddEdit = context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' });
  assert.deepEqual(Array.from(tddEdit.data.photos, p => p.name), ['pre1.jpg', 'pre2.jpg', 'pre3.png', 'rapat1.jpg', 'rapat2.jpg', 'rapat3.jpg', 'rapat4.jpg']);

  // 3. Upload 3 photos from Buku Tamu Edit -> total 10, visible in Jadwal Rapat Edit, no duplicates
  const tddUpload = context.saveTddPhotos({
    kode_kunjungan: 'TDD-11112026-001',
    files: [
      { name: 'bt1.jpg', data: SAMPLE_JPG },
      { name: 'bt2.jpg', data: SAMPLE_JPG },
      { name: 'bt3.jpg', data: SAMPLE_JPG }
    ]
  });
  assert.equal(tddUpload.success, true, tddUpload.error);
  assert.equal(tddUpload.data.photos.length, 10);

  calAgenda = context.getRapatCalendar().data.find(m => m.id === 11);
  assert.equal(calAgenda.photos.length, 10);
  assert.equal(calAgenda.photos[9].name, 'bt3.jpg');
  assert.equal(new Set(calAgenda.photos.map(p => p.url)).size, 10, 'no duplicate photo entries');

  // Shared 10-photo limit enforced from both interfaces
  assert.equal(context.saveAgendaPhotos({ rapat_id: 11, files: [{ name: 'over1.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: [{ name: 'over2.jpg', data: SAMPLE_JPG }] }).success, false);

  // Download works from both interfaces for any photo index
  assert.equal(context.getAgendaPhotoDocument({ rapat_id: 11, index: 9 }).data.name, 'bt3.jpg');
  assert.equal(context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-001', index: 3 }).data.name, 'rapat1.jpg');

  // 4. Postponed (Ditunda) blocks photo upload from both interfaces, while keeping existing photos readable
  assert.equal(context.postponeAgendaRapat({ rapat_id: 11 }).success, true);
  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: [{ name: 'x.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(context.saveAgendaPhotos({ rapat_id: 11, files: [{ name: 'x.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(context.rescheduleAgendaRapat({ rapat_id: 11, tanggal: '2026-11-14', jam_mulai: '09:00', jam_selesai: '10:30' }).success, true);

  // 5. Lock enforcement blocks writes from BOTH Jadwal Rapat and Buku Tamu Edit while preserving Preview & Download
  assert.equal(context.lockAgendaRapat({ rapat_id: 11 }).success, true);
  const writesBeforeLockChecks = driveWrites.length;
  tddEdit = context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-001' });
  assert.equal(tddEdit.data.locked, true);
  assert.equal(tddEdit.data.photos.length, 10);

  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-001', files: [{ name: 'locked.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(context.saveAgendaPhotos({ rapat_id: 11, files: [{ name: 'locked.jpg', data: SAMPLE_JPG }] }).success, false);
  assert.equal(context.updateJadwalRapat({
    rapat_id: 11, judul: 'Bypass', ruangan: '6001|Ruang Rapat Utama Diskum', tanggal: '2026-11-14',
    jam_mulai: '09:00', jam_selesai: '10:30', bidang: 'Sekretariat', pimpinan: 'PIC', agenda: 'A'
  }).success, false);
  assert.equal(driveWrites.length, writesBeforeLockChecks, 'no Drive writes on locked agenda');

  assert.equal(context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-001', index: 0 }).success, true);
  assert.equal(context.getAgendaPhotoDocument({ rapat_id: 11, index: 0 }).success, true);
});

test('GAS cancelling a previously scheduled VISIT-TDD agenda retains shared photos under Buku Tamu without an agenda', () => {
  const tddRow = [
    1, 'TDD-11112026-009', 'dalam_daerah_fo', 'UMKM Melati', '', 2,
    'Dian Sari', 'Dian Sari\nTono', 'Bidang Kewirausahaan', 'Pelatihan',
    'Dian Sari', '080000000199', '2026-11-11', '09:00', '', '',
    'kewirausahaan', 'Fitria Lestari Pujiastuti, S.E.', 0, 'Non-SPPD', '2026-11-11 08:30:00'
  ];
  const existingAgenda = [
    25, 'VISIT-TDD-11112026-009', 'Kunjungan UMKM Melati', 6001, 'Ruang Rapat Utama Diskum',
    '2026-11-12', '09:00', '10:00', 'Bidang Kewirausahaan', 'Fitria Lestari Pujiastuti, S.E.', 2, 'Pelatihan', 'Terjadwal', '2026-11-11 08:35:00'
  ];
  const { context } = createGasHarness({ initialVisitors: [tddRow], initialMeetings: [existingAgenda] });

  assert.equal(context.saveTddPhotos({ kode_kunjungan: 'TDD-11112026-009', files: [{ name: 'awal.jpg', data: SAMPLE_JPG }] }).success, true);
  assert.equal(context.saveAgendaPhotos({ rapat_id: 25, files: [{ name: 'di-rapat.jpg', data: SAMPLE_PNG }] }).success, true);

  assert.equal(context.cancelAgendaRapat({ rapat_id: 25 }).success, true);
  const unscheduledAgain = context.getTddVisitEdit({ kode_kunjungan: 'TDD-11112026-009' });
  assert.equal(unscheduledAgain.success, true, unscheduledAgain.error);
  assert.equal(unscheduledAgain.data.agenda, null);
  assert.deepEqual(Array.from(unscheduledAgain.data.photos, p => p.name), ['awal.jpg', 'di-rapat.jpg']);
  assert.equal(context.getTddPhotoDocument({ kode_kunjungan: 'TDD-11112026-009', index: 1 }).data.name, 'di-rapat.jpg');
});

test('local HTTP server supports unscheduled TDD uploads without scheduling and preserves previously scheduled agenda sync & locks', async () => {
  const server = createLocalTestServer({ now: new Date('2026-11-11T03:00:00Z') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => fetch(`${base}/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  try {
    // Scheduling endpoint is removed from local server
    const removedRes = await rpc('scheduleTddAgenda', { kode_kunjungan: 'TDD-11112026-001' });
    assert.equal(removedRes.status, 404);
    assert.equal((await removedRes.json()).success, false);

    const meetingsBefore = (await (await rpc('getRapatCalendar')).json()).data.length;
    const reg = await (await rpc('registerTamuFo', completeTddPayload({
      ketua_nama: 'Ketua Uji Rev07',
      pengikut_list: 'Ketua Uji Rev07\nAnggota Rev07',
      jumlah_orang: 2,
      instansi: 'Koperasi Cahaya Rev07'
    }))).json();
    assert.equal(reg.success, true, reg.error);
    const code = reg.data.kode_kunjungan;

    // Unscheduled upload, getTddVisitEdit, and download work without touching Data_Rapat
    const preUpload = await (await rpc('saveTddPhotos', {
      kode_kunjungan: code,
      files: [{ name: 'sebelum-jadwal.jpg', data: SAMPLE_JPG }]
    })).json();
    assert.equal(preUpload.success, true, preUpload.error);
    assert.equal(preUpload.data.agenda, null);
    assert.equal(preUpload.data.photos.length, 1);

    const editRes = await (await rpc('getTddVisitEdit', { kode_kunjungan: code })).json();
    assert.equal(editRes.success, true, editRes.error);
    assert.equal(editRes.data.agenda, null);
    assert.deepEqual(editRes.data.photos.map(p => p.name), ['sebelum-jadwal.jpg']);

    const preDownload = await (await rpc('getTddPhotoDocument', { kode_kunjungan: code, index: 0 })).json();
    assert.equal(preDownload.success, true, preDownload.error);
    assert.equal(preDownload.data.name, 'sebelum-jadwal.jpg');
    assert.equal((await (await rpc('getRapatCalendar')).json()).data.length, meetingsBefore);

    // Local workflow adapter with a pre-existing scheduled VISIT-TDD agenda retains bidirectional sync, locks, and cancel photo preservation
    const existingVisit = {
      kode_kunjungan: 'TDD-11112026-077', tipe_tamu: 'dalam_daerah_fo',
      instansi: 'Koperasi Terjadwal Lokal', alamat: 'Batam', jumlah_orang: 2,
      ketua_nama: 'Ketua Terjadwal', pengikut_list: 'Ketua Terjadwal\nAnggota',
      tujuan_bidang: 'Bidang Pengawasan Koperasi', lo_nama: 'PIC Lokal',
      keperluan: 'Konsultasi', narahubung_hp: '080000000177',
      tanggal_kunjungan: '2026-11-11', jam_kunjungan: '09:00', status_kunjungan: 'Non-SPPD'
    };
    const existingAgenda = {
      id: 901, kode_rapat: 'VISIT-TDD-11112026-077', kode_kunjungan: 'TDD-11112026-077',
      judul_rapat: 'Kunjungan Koperasi Terjadwal Lokal', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum',
      tanggal: '2026-11-12', jam_mulai: '10:00', jam_selesai: '11:30',
      penyelenggara_bidang: 'Bidang Pengawasan Koperasi', pimpinan_rapat: 'PIC Lokal',
      jumlah_peserta: 2, agenda: 'Konsultasi', status: 'Terjadwal', locked: false, photos: []
    };
    const wf = createVisitWorkflow({
      visitors: [existingVisit],
      meetings: [existingAgenda],
      sppd: [],
      rooms: [{ id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50 }],
      currentTime: () => new Date('2026-11-11T03:00:00Z')
    });
    assert.equal(wf.handle('saveAgendaPhotos', { rapat_id: 901, files: [{ name: 'dari-rapat.png', data: SAMPLE_PNG }] }).success, true);
    const tddAfter = wf.handle('saveTddPhotos', { kode_kunjungan: 'TDD-11112026-077', files: [{ name: 'dari-tamu.jpg', data: SAMPLE_JPG }] });
    assert.equal(tddAfter.success, true, tddAfter.error);
    assert.deepEqual(tddAfter.data.photos.map(p => p.name), ['dari-rapat.png', 'dari-tamu.jpg']);
    assert.equal(wf.handle('lockAgendaRapat', { rapat_id: 901 }).success, true);
    assert.equal(wf.handle('saveTddPhotos', { kode_kunjungan: 'TDD-11112026-077', files: [{ name: 'blocked.jpg', data: SAMPLE_JPG }] }).success, false);
    assert.equal(wf.handle('getTddPhotoDocument', { kode_kunjungan: 'TDD-11112026-077', index: 0 }).data.name, 'dari-rapat.png');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('Admin TddModal UI omits scheduling controls, supports unscheduled photo preview/download, and preserves existing linked agenda sync & lock mode', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const tddHtml = fs.readFileSync(path.join(root, 'Admin/TddModal.html'), 'utf8');
  const tddScript = tddHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(tddScript, 'TddModal script exists');
  assert.doesNotMatch(tddScript, /<(?:iframe|img)\b/i, 'TddModal inline script contains no literal embedded-media tags');
  assert.doesNotMatch(tddHtml, /Jadwalkan Ruangan Rapat|tddBookingForm|tddBookingSubmit|submitTddBooking|tddRoom|tddBookingDate|tddStart|tddEnd|scheduleTddAgenda/i);
  assert.match(html, /id="tddEditModal"/);

  const elements = {};
  const makeEl = id => (elements[id] ||= {
    id, hidden: id === 'tddEditModal', disabled: false, innerHTML: '', textContent: '', value: '',
    querySelectorAll: () => [],
    focus() {},
    reportValidity: () => true
  });
  const toasts = [];
  const rpcCalls = [];
  const downloads = [];
  const sampleVisit = {
    kode_kunjungan: 'TDD-11112026-001', tipe_tamu: 'dalam_daerah_fo',
    instansi: 'Koperasi <Uji>', alamat: 'Batam', jumlah_orang: 2,
    ketua_nama: 'Ketua Uji', pengikut_list: 'Ketua Uji\nAnggota Satu',
    tujuan_bidang: 'Bidang Pengawasan Koperasi', lo_nama: 'PIC Uji',
    keperluan: 'Konsultasi', narahubung_hp: '0800000001',
    tanggal_kunjungan: '2026-11-11', jam_kunjungan: '09:00'
  };
  let serverState = {
    visit: sampleVisit,
    agenda: null,
    photos: [],
    locked: false
  };

  class Reader {
    readAsDataURL() {
      this.result = 'data:application/octet-stream;base64,/9j/2Q==';
      this.onload();
    }
  }

  const ctx = vm.createContext({
    Blob,
    FileReader: Reader,
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
    atob: str => Buffer.from(str, 'base64').toString('binary'),
    allTamuData: [sampleVisit],
    allRapatData: [],
    editingRapatId: null,
    document: {
      activeElement: null,
      body: { style: { overflow: '' } },
      addEventListener() {},
      getElementById: id => makeEl(id),
      querySelector: () => ({ focus() {} }),
      createElement: tag => {
        const attrs = {};
        return {
          setAttribute: (k, v) => { attrs[k] = v; },
          click() { downloads.push({ href: this.href, download: this.download }); },
          get outerHTML() {
            const esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            return `<${tag}` + Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('') + (tag === 'img' ? '>' : `></${tag}>`);
          }
        };
      }
    },
    escapeHtml: v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
    isMeetingLocked: m => Boolean(m && (m.locked === true || String(m.status || '').toLowerCase() === 'terkunci')),
    visitFileMime: file => file.name.endsWith('.jpg') ? 'image/jpeg' : '',
    encodeVisitUploadFile: async () => 'data:image/jpeg;base64,/9j/2Q==',
    renderMeetingsList() {},
    showToast: (type, title, msg) => toasts.push({ type, title, msg }),
    visitRpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      if (name === 'getTddVisitEdit') return JSON.parse(JSON.stringify(serverState));
      if (name === 'saveTddPhotos') {
        serverState = {
          ...serverState,
          photos: serverState.photos.concat(payload.files.map((f, i) => ({ name: f.name, url: `/local-doc/${serverState.photos.length + i + 1}` })))
        };
        return JSON.parse(JSON.stringify(serverState));
      }
      if (name === 'getTddPhotoDocument') {
        return { name: serverState.photos[payload.index].name, mime: 'image/jpeg', base64: '/9j/2Q==' };
      }
      return null;
    }
  });
  vm.runInContext(tddScript, ctx);
  assert.equal(ctx.submitTddBooking, undefined);

  // Open unscheduled TDD -> displays escaped details and photo upload/preview/download with NO scheduling controls
  await ctx.openTddEdit('TDD-11112026-001');
  assert.equal(elements.tddEditModal.hidden, false);
  assert.match(elements.tddModalContent.innerHTML, /Koperasi &lt;Uji&gt;/);
  assert.doesNotMatch(elements.tddModalContent.innerHTML, /Jadwalkan Ruangan Rapat|tddBookingForm|tddAgendaSection/);
  assert.match(elements.tddModalContent.innerHTML, /id="tddPhotoUpload"/);
  assert.doesNotMatch(elements.tddModalContent.innerHTML, /id="tddPhotoUpload"[^>]*hidden/);

  // Upload & download photo without an agenda
  await ctx.saveTddPhotos({ files: [{ name: 'sebelum.jpg', type: 'image/jpeg', size: 100 }], value: 'sebelum.jpg' });
  assert.match(elements.tddModalContent.innerHTML, /sebelum\.jpg/);
  assert.match(elements.tddModalContent.innerHTML, /href="\/local-doc\/1"[^>]*>Lihat<\/a>/);
  assert.match(elements.tddModalContent.innerHTML, /data-index="0"[^>]*onclick="downloadTddPhoto\(Number\(this\.dataset\.index\),this\)"/);
  await ctx.downloadTddPhoto(0, {});
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].download, 'sebelum.jpg');

  // Pre-existing linked agenda -> displays read-only agenda info (no booking form), syncs allRapatData photos on upload
  const linkedAgenda = {
    id: 99, kode_rapat: 'VISIT-' + sampleVisit.kode_kunjungan, kode_kunjungan: sampleVisit.kode_kunjungan,
    judul_rapat: 'Kunjungan Koperasi <Uji>', nama_ruangan: 'Ruang Rapat Utama Diskum',
    tanggal: '2026-11-18', jam_mulai: '10:00', jam_selesai: '11:30',
    status: 'Terjadwal', locked: false, photos: serverState.photos.slice()
  };
  serverState.agenda = linkedAgenda;
  ctx.allRapatData.push({ ...linkedAgenda });
  await ctx.openTddEdit('TDD-11112026-001');
  assert.match(elements.tddModalContent.innerHTML, /id="tddAgendaSection"/);
  assert.match(elements.tddModalContent.innerHTML, /VISIT-TDD-11112026-001/);
  assert.doesNotMatch(elements.tddModalContent.innerHTML, /tddBookingForm|Jadwalkan Ruangan Rapat/);
  await ctx.saveTddPhotos({ files: [{ name: 'kedua.jpg', type: 'image/jpeg', size: 100 }], value: 'kedua.jpg' });
  assert.equal(ctx.allRapatData[0].photos.length, 2);

  // Locked agenda -> read-only banner, upload hidden & rejected client-side, Lihat & Unduh remain enabled
  serverState.locked = true;
  serverState.agenda.status = 'Terkunci';
  serverState.agenda.locked = true;
  await ctx.openTddEdit('TDD-11112026-001');
  assert.match(elements.tddModalContent.innerHTML, /id="tddModalLockBanner"/);
  assert.match(elements.tddModalContent.innerHTML, /id="tddPhotoUpload"\s+hidden/);
  assert.match(elements.tddModalContent.innerHTML, /data-index="0"[^>]*onclick="downloadTddPhoto\(Number\(this\.dataset\.index\),this\)"/);
  const callsBeforeLockedUpload = rpcCalls.length;
  await ctx.saveTddPhotos({ files: [{ name: 'blocked.jpg', type: 'image/jpeg', size: 100 }], value: 'blocked.jpg' });
  assert.equal(rpcCalls.length, callsBeforeLockedUpload, 'locked TDD blocks client upload');

  // Edit Rapat attachment hint differentiates VISIT-TDD vs VISIT-TLD
  const hintCtx = vm.createContext({
    allTamuData: [sampleVisit],
    document: { getElementById: id => makeEl(id) },
    escapeHtml: v => String(v ?? ''),
    isMeetingLocked: () => false,
    renderMeetingEditPhotos() {}
  });
  vm.runInContext(extractFn(html, 'isTddVisit'), hintCtx);
  vm.runInContext(extractFn(html, 'renderMeetingEditAttachments'), hintCtx);
  hintCtx.renderMeetingEditAttachments({ id: 99, kode_rapat: 'VISIT-TDD-11112026-001', kode_kunjungan: 'TDD-11112026-001', photos: [] });
  assert.match(elements.meetingEditPhotoHint.textContent, /tersinkronisasi dengan menu Buku Tamu/i);
  hintCtx.renderMeetingEditAttachments({ id: 100, kode_rapat: 'VISIT-TLD-1', kode_kunjungan: 'TLD-1', photos: [] });
  assert.match(elements.meetingEditPhotoHint.textContent, /tab SPPD/i);
});

test('GAS preserves pre-existing scheduled VISIT-TDD agendas and existing Foto_Agenda photos without duplicating', () => {
  const legacyTddRow = [
    1, 'TDD-01102026-005', 'dalam_daerah_fo', 'Koperasi Terjadwal Lama', '', 2,
    'Agus Salim', '', 'Koperasi', 'Konsultasi lama',
    'Agus Salim', '080000000155', '2026-10-01', '09:00', '', '',
    '', 'PIC Lama', 0, 'Diterima', '2026-10-01 08:30:00'
  ];
  const existingVisitAgenda = [
    42, 'VISIT-TDD-01102026-005', 'Kunjungan Koperasi Terjadwal Lama', 6001, 'Ruang Rapat Utama Diskum',
    '2026-10-01', '09:30', '10:30', 'Koperasi', 'PIC Lama', 2, 'Konsultasi lama', 'Selesai', '2026-10-01 09:00:00'
  ];
  const existingPhotoRow = [
    42,
    JSON.stringify([{ name: 'legacy-agenda-foto.jpg', url: 'https://drive.google.com/file/d/legacy-photo-1/view', mime: 'image/jpeg', label: 'Foto Agenda Kunjungan' }]),
    '2026-10-01T10:00:00Z'
  ];
  const { context, sheets } = createGasHarness({
    initialVisitors: [legacyTddRow],
    initialMeetings: [existingVisitAgenda],
    initialPhotos: [existingPhotoRow]
  });

  assert.equal(typeof context.scheduleTddAgenda, 'undefined');
  const loaded = context.getTddVisitEdit({ kode_kunjungan: 'TDD-01102026-005' });
  assert.equal(loaded.success, true, loaded.error);
  assert.equal(loaded.data.agenda.id, 42);
  assert.equal(loaded.data.locked, false);
  assert.deepEqual(Array.from(loaded.data.photos, p => p.name), ['legacy-agenda-foto.jpg']);

  // Adding a photo via Buku Tamu Edit appends to row 42 in Foto_Agenda and shows in Jadwal Rapat
  const added = context.saveTddPhotos({ kode_kunjungan: 'TDD-01102026-005', files: [{ name: 'baru.jpg', data: SAMPLE_JPG }] });
  assert.equal(added.success, true, added.error);
  assert.deepEqual(Array.from(added.data.photos, p => p.name), ['legacy-agenda-foto.jpg', 'baru.jpg']);
  assert.equal(sheets.get('Foto_Agenda').rows.length, 2, 'single shared row in Foto_Agenda');
  const calPhotos = context.getRapatCalendar().data.find(m => m.id === 42).photos;
  assert.deepEqual(Array.from(calPhotos, p => p.name), ['legacy-agenda-foto.jpg', 'baru.jpg']);
});
