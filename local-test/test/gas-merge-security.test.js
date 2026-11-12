'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function makeSheet(name, initialRows = []) {
  const rows = initialRows.map(r => r.slice());
  return {
    name,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((max, r) => Math.max(max, r.length), 0),
    appendRow: row => rows.push(row.slice()),
    getRange: (startRow, startCol, numRows = 1, numCols = 1) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const row = rows[startRow - 1 + r] || [];
          const slice = [];
          for (let c = 0; c < numCols; c++) slice.push(row[startCol - 1 + c]);
          out.push(slice);
        }
        return out;
      },
      getDisplayValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const row = rows[startRow - 1 + r] || [];
          const slice = [];
          for (let c = 0; c < numCols; c++) {
            const val = row[startCol - 1 + c];
            slice.push(val == null ? '' : String(val));
          }
          out.push(slice);
        }
        return out;
      },
      setValue: val => {
        while (rows.length < startRow) rows.push([]);
        while (rows[startRow - 1].length < startCol) rows[startRow - 1].push('');
        rows[startRow - 1][startCol - 1] = val;
      },
      setValues: matrix => {
        for (let r = 0; r < matrix.length; r++) {
          while (rows.length < startRow + r) rows.push([]);
          for (let c = 0; c < matrix[r].length; c++) {
            while (rows[startRow - 1 + r].length < startCol + c) rows[startRow - 1 + r].push('');
            rows[startRow - 1 + r][startCol - 1 + c] = matrix[r][c];
          }
        }
      },
      setNumberFormat: () => ({ setValues: () => {} }),
      setBackground: () => ({ setFontColor: () => ({ setFontWeight: () => {} }) }),
      sort: () => {}
    }),
    _rows: rows
  };
}

function createGasContext(options = {}) {
  const email = options.email !== undefined ? options.email : '';
  const props = Object.assign({
    ADMIN_DEMO_MODE: 'false',
    APPROVER_EMAIL: 'owner@example.com, approver2@example.com; lead3@example.com'
  }, options.props || {});

  const counters = {
    lockWait: 0,
    lockRelease: 0,
    flush: 0,
    urlFetch: 0,
    configureCalled: 0,
    ensureDocsCalled: 0,
    ensureRoomCalled: 0,
    ensureEmpCalled: 0,
    includeLoads: [],
    templateCreated: []
  };

  const sheets = options.sheets || {
    Data_Tamu: makeSheet('Data_Tamu', [
      ['ID', 'Kode', 'Tipe', 'Instansi', 'Alamat', 'Jumlah', 'Ketua', 'Pengikut', 'Bidang', 'Keperluan', 'Narahubung', 'HP', 'Tanggal', 'Jam', 'Surat1', 'Surat2', 'LO_ID', 'LO_Nama', 'SPPD', 'Status', 'Created'],
      [1, 'TLD-31102026-001', 'luar_daerah', 'Instansi Lama', 'Batam', 1, 'Budi', '', 'Koperasi', 'Konsultasi', 'Budi', '0811', '2026-11-01', '09:00', '', '', '', '', 1, 'Diterima', '2026-11-01'],
      [5, 'TLD-02112026-002', 'luar_daerah', 'Instansi Cutoff', 'Batam', 2, 'Siti', '', 'Koperasi', 'Koordinasi', 'Siti', '0812', '2026-11-02', '10:00', '', '', '', '', 1, 'Diterima', '2026-11-02']
    ]),
    Data_Rapat: makeSheet('Data_Rapat', [
      ['ID', 'Kode', 'Judul', 'RoomID', 'RoomName', 'Tanggal', 'Mulai', 'Selesai', 'Bidang', 'Pimpinan', 'Jumlah', 'Agenda', 'Status', 'Created'],
      [2, 'RPT-20261101-101', 'Rapat Oktober', '1', 'Ruang A', '2026-11-01', '09:00', '10:00', 'Sekretariat', 'Kadis', 5, 'Lama', 'Terjadwal', '2026-11-01 08:00:00'],
      [7, 'RPT-20261102-102', 'Rapat Cutoff', '1', 'Ruang A', '2026-11-02', '09:00', '10:00', 'Sekretariat', 'Kadis', 5, 'Valid', 'Terjadwal', '2026-11-02 08:00:00']
    ]),
    Data_Presensi: makeSheet('Data_Presensi', [
      ['ID', 'RapatID', 'Judul', 'Kategori', 'Nama', 'NIP', 'Jabatan', 'OPD', 'HP', 'Waktu', 'MemberID', 'Sumber', 'Dicatat'],
      [3, 7, 'Rapat Cutoff', 'Diskum', 'Pegawai Awal', '-', 'Staf', 'Diskum', '-', '2026-11-02 09:05:00', '', 'QR', '2026-11-02 09:05:00']
    ]),
    Kendali_SPPD: makeSheet('Kendali_SPPD', [
      ['ID', 'TamuID', 'Kode', 'Instansi', 'Ketua', 'Foto', 'Absen', 'Notulen', 'Status', 'TTD1', 'Nama1', 'Wkt1', 'TTD2', 'Nama2', 'Wkt2', 'Catatan'],
      [1, 1, 'TLD-31102026-001', 'Instansi Lama', 'Budi', '', '', '', 'Belum Lengkap', '', '', '', '', '', '', ''],
      [2, 5, 'TLD-02112026-002', 'Instansi Cutoff', 'Siti', '', '', '', 'Belum Lengkap', '', '', '', '', '', '', '']
    ]),
    Master_Pegawai: makeSheet('Master_Pegawai', [
      ['ID', 'NIP', 'Nama', 'Jabatan', 'Bidang', 'Is_LO', 'Workload', 'Status', 'Pangkat']
    ]),
    Master_Ruangan: makeSheet('Master_Ruangan', [
      ['ID', 'Nama', 'Kapasitas', 'Fasilitas', 'Lokasi', 'Warna'],
      [1, 'Ruang Rapat Utama (Lantai 2)', 30, 'Proyektor', 'Lantai 2', '#2563eb']
    ]),
    Alur_Kunjungan: makeSheet('Alur_Kunjungan', [['Kode Kunjungan', 'Versi', 'Data Alur JSON', 'Diperbarui']])
  };

  const spreadsheet = {
    getId: () => 'ss-test-id',
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => {
      const s = makeSheet(name);
      sheets[name] = s;
      return s;
    }
  };

  const ctx = vm.createContext({
    Date: options.DateClass || Date,
    Session: {
      getActiveUser: () => ({ getEmail: () => email })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => (Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null),
        setProperty: (key, val) => { props[key] = val; },
        setProperties: obj => Object.assign(props, obj)
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { counters.lockWait++; },
        releaseLock: () => { counters.lockRelease++; }
      })
    },
    SpreadsheetApp: {
      flush: () => { counters.flush++; },
      openById: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/test/exec' })
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} })
    },
    UrlFetchApp: {
      fetch: () => { counters.urlFetch++; return { getContentText: () => '{}' }; }
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => ({
        createFile: () => ({ setSharing: () => {}, getUrl: () => 'https://drive.example/file/1' })
      }),
      getFilesByName: () => ({ hasNext: () => true, next: () => ({ getId: () => 'ss-test-id' }) })
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: name => {
        counters.templateCreated.push(name);
        const out = { rendered: name };
        out.setTitle = () => out;
        out.setXFrameOptionsMode = () => out;
        out.addMetaTag = () => out;
        return { evaluate: () => out };
      },
      createHtmlOutputFromFile: name => {
        counters.includeLoads.push(name);
        return { getContent: () => `<!-- ${name} -->` };
      }
    },
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => 'uuid-1',
      base64Decode: s => Buffer.from(String(s || ''), 'base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (date, tz, fmt) => {
        const d = date instanceof Date ? date : new Date(date);
        const parts = {};
        new Intl.DateTimeFormat('en-GB', {
          timeZone: tz || 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
        const hh = parts.hour === '24' ? '00' : parts.hour;
        if (fmt === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
        if (fmt === 'HH:mm') return `${hh}:${parts.minute}`;
        if (fmt === 'ddMMyyyy') return `${parts.day}${parts.month}${parts.year}`;
        return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
      }
    }
  });

  const adminFiles = options.files || [
    'Admin/Code.js',
    'Admin/Setup.js',
    'Admin/AutoSort.js',
    'Admin/MeetingRooms.js',
    'Admin/PublicApi.js',
    'Admin/VisitWorkflow.js',
    'Admin/VisitWorkflowStorage.js',
    'Admin/AgendaDocuments.js',
    'Admin/AgendaAttendanceData.js'
  ];
  for (const file of adminFiles) {
    vm.runInContext(readText(file), ctx);
  }

  ctx.configureNewDeployment_ = () => { counters.configureCalled++; };
  ctx.ensurePublicVisitDocuments_ = () => { counters.ensureDocsCalled++; };
  ctx.ensurePlutMeetingRoom_ = () => { counters.ensureRoomCalled++; };
  ctx.ensureEmployeeDirectory_ = () => { counters.ensureEmpCalled++; return 0; };

  return { ctx, counters, props, sheets, spreadsheet };
}

test('Admin and Public manifests satisfy dev trial access policy and revertible configuration', () => {
  const adminManifest = JSON.parse(readText('Admin/appsscript.json'));
  assert.equal(adminManifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(adminManifest.webapp.access, 'ANYONE');
  assert.notEqual(adminManifest.webapp.access, 'MYSELF');
  assert.notEqual(adminManifest.webapp.access, 'ANYONE_ANONYMOUS');

  const publicManifest = JSON.parse(readText('Public/appsscript.json'));
  assert.equal(publicManifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(publicManifest.webapp.access, 'ANYONE_ANONYMOUS');
  const coreLib = publicManifest.dependencies.libraries.find(l => l.userSymbol === 'SiTariCore');
  assert.ok(coreLib);
  assert.equal(coreLib.version, '46');
});

test('doGet, include, and ADMIN_INCLUDE_FILES_ fail closed on consumer empty email and non-allowlisted includes', () => {
  // Simulates non-owner @gmail.com tester under ANYONE + USER_DEPLOYING where getEmail() returns ""
  const anon = createGasContext({ email: '' });
  assert.throws(() => anon.ctx.doGet({ parameter: {} }), /belum diberi akses admin/);
  assert.throws(() => anon.ctx.doGet({ parameter: { page: 'presensi-admin', id: '7' } }), /belum diberi akses admin/);
  assert.equal(anon.counters.configureCalled, 0, 'doGet must not run setup side effects when unauthorized');
  assert.equal(anon.counters.ensureDocsCalled, 0);
  assert.equal(anon.counters.ensureRoomCalled, 0);
  assert.equal(anon.counters.ensureEmpCalled, 0);
  assert.throws(() => anon.ctx.include('Stylesheet'), /belum diberi akses admin/);
  assert.equal(anon.counters.includeLoads.length, 0);

  // Unapproved signed-in email must also fail closed
  const outsider = createGasContext({ email: 'outsider@gmail.com' });
  assert.throws(() => outsider.ctx.doGet({ parameter: {} }), /belum diberi akses admin/);
  assert.throws(() => outsider.ctx.include('Index'), /belum diberi akses admin/);

  // Multi-email APPROVER_EMAIL supports comma, semicolon, and whitespace lists case-insensitively
  const admin2 = createGasContext({ email: 'APPROVER2@EXAMPLE.COM' });
  assert.doesNotThrow(() => admin2.ctx.doGet({ parameter: {} }));
  assert.equal(admin2.counters.configureCalled, 1);
  assert.equal(admin2.counters.templateCreated[0], 'Index');

  const admin3 = createGasContext({ email: 'Lead3@Example.com' });
  assert.equal(admin3.ctx.include('Stylesheet'), '<!-- Stylesheet -->');
  assert.throws(() => admin3.ctx.include('DeploymentConfig'), /Konten tidak tersedia/);
  assert.throws(() => admin3.ctx.include('VisitPicContacts'), /Konten tidak tersedia/);
  assert.throws(() => admin3.ctx.include('../Code'), /Konten tidak tersedia/);
});

test('all Admin RPCs fail closed before acquiring ScriptLock or triggering network/sheet writes', () => {
  const anon = createGasContext({ email: '' });
  const c = anon.ctx;

  const returnFalseRpcs = [
    () => c.getDashboardData(),
    () => c.getDashboardSummary(),
    () => c.getMasterData(),
    () => c.getTamuList(),
    () => c.getRapatCalendar(),
    () => c.getSppdList(),
    () => c.getMeetingRoomOptions(),
    () => c.getVisitWorkflow({ kode_kunjungan: 'TLD-02112026-002' }),
    () => c.saveVisitWorkflow({ kode_kunjungan: 'TLD-02112026-002', action: 'acknowledge' }),
    () => c.getTddVisitEdit({ kode_kunjungan: 'TDD-02112026-003' }),
    () => c.submitManualVisitAttendance({ rapat_id: 7, member_ids: ['ketua'] }),
    () => c.submitAdminPresensiRapat({ rapat_id: 7, nama: 'Anon', jam_kehadiran: '09:10' }),
    () => c.getAgendaNotulaContext({ rapat_id: 7 }),
    () => c.saveAgendaNotula({ rapat_id: 7 }),
    () => c.saveAgendaPhotos({ rapat_id: 7, files: [] }),
    () => c.getAgendaPhotoDocument({ rapat_id: 7, index: 0 }),
    () => c.saveTddPhotos({ kode_kunjungan: 'TDD-1', files: [] }),
    () => c.getTddPhotoDocument({ kode_kunjungan: 'TDD-1', index: 0 }),
    () => c.simpanJadwalRapat({}),
    () => c.updateJadwalRapat({ rapat_id: 7 }),
    () => c.postponeAgendaRapat({ rapat_id: 7 }),
    () => c.rescheduleAgendaRapat({ rapat_id: 7 }),
    () => c.lockAgendaRapat({ rapat_id: 7 }),
    () => c.cancelAgendaRapat({ rapat_id: 7 }),
    () => c.createRapatSchedule({}),
    () => c.uploadBuktiSppd({ sppd_id: 2 }),
    () => c.ttdPejabatTeknis(2),
    () => c.ttdKasubagUmpeg(2)
  ];

  for (const invoke of returnFalseRpcs) {
    const res = invoke();
    assert.equal(res.success, false);
    assert.match(res.error, /belum diberi akses admin/);
  }

  const throwingRpcs = [
    () => c.saveBase64ToDrive('Zm9v', 'x.pdf', 'application/pdf', 'bukti'),
    () => c.assignLiaisonOfficer(anon.spreadsheet, 'Koperasi'),
    () => c.autoSortAllSheets(anon.spreadsheet),
    () => c.setupGoogleDriveFolders(),
    () => c.setupSheetMasterPegawai(anon.spreadsheet),
    () => c.setupSheetDataTamu(anon.spreadsheet)
  ];
  for (const invoke of throwingRpcs) {
    assert.throws(invoke, /belum diberi akses admin/);
  }

  assert.equal(anon.counters.lockWait, 0, 'ScriptLock must never be acquired when authorization fails');
  assert.equal(anon.counters.urlFetch, 0, 'Fonnte/UrlFetchApp must never be called when authorization fails');
  assert.equal(anon.sheets.Kendali_SPPD._rows[2][8], 'Belum Lengkap');
});

test('Public API and Public @16 features work without Admin auth while honoring Nov 2 cutoff and flush', () => {
  const pub = createGasContext({ email: '' });
  const c = pub.ctx;

  const master = c.getPublicAttendanceMasterData();
  assert.equal(master.success, true);
  assert.ok(master.data.opd.some(o => o.nama_opd === 'Kelurahan'));

  const cal = c.getPublicAttendanceCalendar();
  assert.equal(cal.success, true);
  assert.deepEqual(cal.data.map(m => m.id), [7], 'Public calendar excludes pre-Nov-2 meeting ID 2');

  const qr = c.submitPresensiRapat({
    rapat_id: 7,
    kategori_peserta: 'OPD_Pemko',
    opd_pemko: 'Kelurahan',
    opd_pemko_wilayah: 'Baloi Permai',
    nama: 'Peserta Kelurahan'
  });
  assert.equal(qr.success, true, qr.error);
  assert.equal(pub.counters.flush, 1, 'SpreadsheetApp.flush must run after attendance write');
  const appended = pub.sheets.Data_Presensi._rows[pub.sheets.Data_Presensi._rows.length - 1];
  assert.equal(appended[0], 4, 'Presensi uses max(ID)+1');
  assert.equal(appended[7], 'Kelurahan - Baloi Permai');
  assert.equal(pub.counters.urlFetch, 0);

  const presensiHtml = readText('Public/Presensi.html');
  assert.match(presensiHtml, /<\?!= include_\('MobileBase'\); \?>/);
  assert.match(presensiHtml, /PEMKO_OPD_OPTIONS/);
  assert.match(presensiHtml, /inputWilayahPemko/);

  const policyHtml = readText('Public/AttendancePolicy.html');
  assert.match(policyHtml, /Ditunda/);
  assert.match(policyHtml, /Terkunci/);
});

test('nextRecordId_ prevents ID reuse across gaps, blanks, booleans, and invalid values; internal helpers keep Nov 2 cutoff', () => {
  const admin = createGasContext({ email: 'owner@example.com' });
  const c = admin.ctx;

  const blankSheet = makeSheet('Blank', [['ID']]);
  assert.equal(c.nextRecordId_(blankSheet), 1);

  const gappedSheet = makeSheet('Gapped', [['ID'], [1], [''], [true], [false], [10], ['4'], ['abc'], [null]]);
  assert.equal(c.nextRecordId_(gappedSheet), 11);

  const tamu = c.getTamuList();
  assert.equal(tamu.success, true);
  assert.deepEqual(tamu.data.map(v => v.id), [5]);

  const sppd = c.getSppdList();
  assert.equal(sppd.success, true);
  assert.deepEqual(sppd.data.map(s => s.id), [2]);

  const dash = c.getDashboardData();
  assert.equal(dash.success, true);
  assert.equal(dash.data.stats.totalTamu, 1);
  assert.equal(dash.data.stats.sppd.total, 1);

  const saveMeeting = c.simpanJadwalRapat({
    judul: 'Rapat Uji ID',
    ruangan: '1|Ruang Rapat Utama (Lantai 2)',
    tanggal: '2026-11-05',
    jam_mulai: '10:00',
    jam_selesai: '11:00',
    bidang: 'Sekretariat',
    pimpinan: 'Kadis',
    agenda: 'Evaluasi ID'
  });
  assert.equal(saveMeeting.success, true, saveMeeting.error);
  const newRow = admin.sheets.Data_Rapat._rows[admin.sheets.Data_Rapat._rows.length - 1];
  assert.equal(newRow[0], 8, 'simpanJadwalRapat uses max(ID)+1 across existing rows');
});

test('local private config files exist locally without placeholder tokens or dummy counts', () => {
  const required = [
    'Admin/DeploymentConfig.js',
    'Admin/EmployeeDirectory.js',
    'Admin/VisitPicContacts.js',
    'Admin/PublicIntake.js',
    'Tamu-FO/Destinations.js',
    'Tamu-Luar/Destinations.js'
  ];
  for (const relPath of required) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `Missing ${relPath}`);
    const content = readText(relPath);
    assert.doesNotMatch(content, /PHONE_NUMBER_PLACEHOLDER/);
    assert.doesNotMatch(content, /APPROVER_EMAIL_PLACEHOLDER/);
  }
  const deployCtx = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        _m: {},
        getProperty(k) { return this._m[k]; },
        setProperty(k, v) { this._m[k] = v; },
        setProperties(o) { Object.assign(this._m, o); }
      })
    }
  });
  vm.runInContext(readText('Admin/DeploymentConfig.js'), deployCtx);
  deployCtx.configureNewDeployment_();
  // Verify PublicIntake Public endpoints omit private PIC phone numbers while exposing 9 destinations
  const intakeCtx = vm.createContext({});
  vm.runInContext(readText('Admin/PublicIntake.js'), intakeCtx);
  assert.equal(intakeCtx.getPublicFormDestinations('tdd').length, 9);
  assert.equal(intakeCtx.getPublicFormDestinations('tld').length, 9);
  for (const item of intakeCtx.getPublicFormDestinations('tld')) {
    assert.equal(item.phone, undefined);
  }

  // PublicIntake writes use max(ID)+1 across gaps and flush SpreadsheetApp
  const tamuSheet = makeSheet('Data_Tamu', [
    ['ID', 'Kode', 'Tipe', 'Instansi', 'Alamat', 'Jumlah', 'Ketua', 'Pengikut', 'Bidang', 'Keperluan', 'Narahubung', 'HP', 'Tanggal', 'Jam', 'Surat1', 'Surat2', 'LO_ID', 'LO_Nama', 'SPPD', 'Status', 'Created'],
    [9, 'TLD-02112026-009', 'luar_daerah', 'Lama', 'Batam', 1, 'A', '', '', 'K', 'A', '0811', '2026-11-02', '08:00', '', '', '', '', 1, 'Diterima', '2026-11-02']
  ]);
  let flushCount = 0;
  const mockSs = {
    getSheetByName: n => (n === 'Data_Tamu' ? tamuSheet : null)
  };
  const intakeWriteCtx = vm.createContext({
    getSpreadsheet: () => mockSs,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k === 'SPREADSHEET_ID' ? 'ss-1' : null),
        setProperty() {}
      })
    },
    SpreadsheetApp: { openById: () => mockSs, flush: () => { flushCount++; } },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => ({ createFile: () => ({ setSharing() {}, getUrl: () => 'https://drive.example/f' }) })
    },
    Utilities: {
      base64Decode: () => Buffer.from('abc'),
      newBlob: () => ({}),
      formatDate: (_d, _tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-11-12' : fmt === 'HH:mm' ? '10:00' : '2026-11-12 10:00:00')
    }
  });
  vm.runInContext(readText('Admin/PublicIntake.js'), intakeWriteCtx);
  const resFo = intakeWriteCtx.publicRegisterTamuFo({
    instansi: 'Koperasi Sejahtera',
    jumlah_orang: 2,
    ketua_nama: 'Budi',
    pengikut_list: 'Andi',
    tujuan_bidang: ['Bidang Pengembangan Usaha Mikro'],
    keperluan: 'Konsultasi',
    narahubung_hp: '08123456789'
  });
  assert.equal(resFo.success, true, resFo.error);
  assert.equal(resFo.data.lo_nama, 'Destri Wilia, S.E.');
  assert.equal(flushCount, 1);
  assert.equal(tamuSheet._rows[tamuSheet._rows.length - 1][0], 10);
});
