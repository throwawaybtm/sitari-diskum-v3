'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer } = require('../server');
const { createFixtureStore } = require('../fixtures');
const { completeTldPayload } = require('./tld-test-data');

const ROOT = path.resolve(__dirname, '../..');

function createPresensiVm({ admin = false } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'Admin/Presensi.html'), 'utf8');
  const fields = {};
  const alerts = [];
  const makeClassList = initial => {
    const set = new Set(initial);
    return {
      add: cls => set.add(cls),
      remove: cls => set.delete(cls),
      contains: cls => set.has(cls)
    };
  };
  const makeField = id => {
    const hiddenInitial = id === 'pemkoWilayahField' || id === 'sectionPemko' || id === 'sectionTamu';
    return {
      value: '',
      required: false,
      disabled: false,
      hidden: hiddenInitial,
      readOnly: false,
      placeholder: '',
      textContent: '',
      innerText: '',
      innerHTML: '',
      options: [],
      customValidity: '',
      classList: makeClassList(hiddenInitial ? ['hidden'] : []),
      setCustomValidity(msg) { this.customValidity = String(msg || ''); },
      replaceChildren(...items) { this.options = items; this.value = items[0] ? String(items[0].value) : ''; },
      add(item) { this.options.push(item); },
      reportValidity() { return !this.customValidity; }
    };
  };

  const context = vm.createContext({
    document: {
      body: { dataset: { adminAttendance: String(admin) } },
      addEventListener() {},
      getElementById(id) {
        return (fields[id] ||= makeField(id));
      }
    },
    Option: class {
      constructor(text, value = text) {
        this.text = String(text);
        this.value = String(value);
      }
    },
    alert: msg => alerts.push(msg),
    console: { error() {}, warn() {} },
    location: { reload() {} }
  });

  fields.formPresensi = {
    reportValidity() {
      const checks = [
        fields.selectRapat,
        fields.selectBidangDiskum,
        fields.selectPegawaiDiskum,
        fields.selectOpdPemko,
        fields.inputWilayahPemko,
        fields.inputNamaPemko,
        fields.inputNamaTamu,
        fields.selectTamuRombongan,
        fields.inputInstansiTamu,
        fields.inputJabatanTamu,
        fields.inputJamKehadiran
      ].filter(Boolean);
      for (const el of checks) {
        if (el.customValidity) return false;
        if (el.required && !el.disabled && !String(el.value || '').trim()) return false;
      }
      return true;
    }
  };

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin/AttendancePolicy.html'), 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1], context);

  context.callBackend = (name, args, success) => {
    if (name === 'getRapatCalendar') {
      success({
        success: true,
        data: [
          { id: 7001, tanggal: '2026-10-26', jam_mulai: '09:00', jam_selesai: '10:30', judul_rapat: 'Rapat Internal Uji', nama_ruangan: 'Ruang Rapat Utama Diskum' },
          { id: 9001, kode_kunjungan: 'TLD-26102026-001', kode_rapat: 'VISIT-TLD-26102026-001', tanggal: '2026-10-26', jam_mulai: '10:30', jam_selesai: '12:00', judul_rapat: 'Kunjungan Dinas Uji', nama_ruangan: 'Ruang Rapat Utama Diskum' }
        ]
      });
      return;
    }
    if (name === 'getMasterData') {
      success({
        success: true,
        data: {
          pegawai: [{ id: 8001, nip: '1990', nama: 'Pegawai Uji', jabatan: 'Analis', bidang: 'Sekretariat' }],
          opd: []
        }
      });
      return;
    }
    if (name === 'getVisitAttendanceRoster') {
      success({
        success: true,
        data: {
          instansi: 'Dinas Koperasi Kab. Uji',
          locked: false,
          roster: [
            { id: 'ketua', nama: 'Ketua Rombongan Uji', peran: 'Ketua Rombongan', attended: false },
            { id: 'anggota-1', nama: 'Anggota Satu Uji', peran: 'Anggota Rombongan', attended: false }
          ]
        }
      });
    }
  };
  context.loadInitialData();
  return { html, context, fields, alerts };
}

function createGasContext({ meetings = [], attendance = [], employees = [], visits = [], workflows = [] } = {}) {
  function makeSheet(headers, rows, withAutoSort) {
    const store = rows.map(r => r.slice());
    return {
      rows: store,
      getLastRow: () => store.length + 1,
      getLastColumn: () => headers.length,
      getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
      appendRow: row => {
        store.push(Array.from(row));
        if (withAutoSort) {
          // Simulate GAS autoSortPresensi descending by column 10 (Waktu_Hadir).
          store.sort((a, b) => String(b[9] || '').localeCompare(String(a[9] || '')));
        }
      },
      getRange: (r, c, n = 1, w = 1) => ({
        getValues: () => store.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w)),
        getDisplayValues: () => store.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w).map(v => String(v ?? ''))),
        setValues: values => values.forEach((vals, i) => {
          const idx = r - 2 + i;
          while (store.length <= idx) store.push([]);
          vals.forEach((v, j) => { store[idx][c - 1 + j] = v; });
        }),
        setValue: val => {
          const idx = r - 2;
          while (store.length <= idx) store.push([]);
          store[idx][c - 1] = val;
        },
        setNumberFormat() { return this; },
        createTextFinder: text => ({
          matchEntireCell() { return this; },
          matchCase() { return this; },
          useRegularExpression() { return this; },
          findNext() {
            const idx = store.findIndex((row, i) => i >= r - 2 && i < r - 2 + n && String(row[c - 1]) === String(text));
            return idx < 0 ? null : { getRow: () => idx + 2 };
          }
        })
      })
    };
  }

  const tamuSheet = makeSheet(new Array(20).fill('H'), visits, false);
  const rapatSheet = makeSheet(new Array(14).fill('H'), meetings, false);
  const presensiSheet = makeSheet(
    ['ID', 'Rapat_ID', 'Judul_Rapat', 'Kategori_Peserta', 'Nama_Peserta', 'NIP', 'Jabatan', 'Nama_OPD_Bidang', 'No_HP', 'Waktu_Hadir', 'Anggota Kunjungan ID', 'Sumber Presensi', 'Waktu Pencatatan'],
    attendance,
    true
  );
  const pegawaiSheet = makeSheet(
    ['ID', 'NIP', 'Nama Pegawai', 'Jabatan', 'Bidang', 'Is_LO', 'Workload_Count', 'Status_Aktif', 'Pangkat / Golongan'],
    employees,
    false
  );
  const wfSheet = makeSheet(['Kode Kunjungan', 'Versi', 'Data Alur JSON', 'Diperbarui'], workflows, false);

  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => ({
      Data_Tamu: tamuSheet,
      Data_Rapat: rapatSheet,
      Data_Presensi: presensiSheet,
      Master_Pegawai: pegawaiSheet,
      Alur_Kunjungan: wfSheet
    })[name] || null
  };

  let clockSec = 0;
  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: (date, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd HH:mm:ss') {
          const s = String(clockSec++).padStart(2, '0');
          return `2026-10-26 09:00:${s}`;
        }
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone: tz || 'Asia/Jakarta',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(date);
      },
      base64Encode: () => 'AQID',
      base64Decode: () => [1, 2, 3],
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      getUuid: () => 'uuid-1'
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => (key === 'ADMIN_DEMO_MODE' ? 'true' : null) }) },
    CacheService: { getScriptCache: () => { throw new Error('no cache'); } }
  });

  for (const file of ['MeetingRooms.js', 'VisitWorkflow.js', 'VisitWorkflowStorage.js', 'VisitArchive.js', 'AgendaDocuments.js', 'Code.js', 'AgendaAttendanceData.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => ss;
  context.VISIT_PIC_CONTACTS = [];
  context.autoSortPresensi = () => {};
  context.requireVisitAdmin_ = () => {};
  context.getApprovalActor_ = () => 'Admin Uji';
  context.saveVisitWorkflowFile_ = (file, code, kind) => ({ name: file.name, url: `https://drive.google.com/file/d/${kind}/view`, mime: 'application/pdf' });
  return { context, ss, presensiSheet };
}

test('TLD Presensi displays red asterisk on Jabatan and enforces required validation matching existing client/server rules', () => {
  const { html, context, fields } = createPresensiVm();

  // Visual indicator (red *) on inputJabatanTamu label
  assert.match(
    html,
    /<label[^>]*for="inputJabatanTamu"[^>]*>[\s\S]*?Jabatan[\s\S]*?<span[^>]*text-rose-600[^>]*>\*<\/span>[\s\S]*?<\/label>/,
    'TLD Presensi Jabatan label must display red * indicator'
  );

  // Required toggles cleanly across categories
  context.setKategoriPeserta('Diskum');
  assert.equal(fields.inputJabatanTamu.required, false);
  context.setKategoriPeserta('OPD_Pemko');
  assert.equal(fields.inputJabatanTamu.required, false);

  // Booked TLD visit (visitRosterMode): Jabatan required, whitespace rejected, valid accepted
  fields.selectRapat.value = '9001';
  context.onPresensiAgendaChange();
  assert.equal(fields.inputJabatanTamu.required, true);
  assert.equal(fields.selectTamuRombongan.required, true);
  assert.equal(fields.inputInstansiTamu.required, true);

  const submitted = [];
  context.callBackend = (name, args, success) => {
    submitted.push({ name, payload: args[0] });
    success({ success: true, message: 'OK' });
  };

  fields.selectTamuRombongan.value = 'ketua';
  fields.inputJabatanTamu.value = '';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 0, 'empty Jabatan must be blocked client-side');

  fields.inputJabatanTamu.value = '   ';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 0, 'whitespace-only Jabatan must be blocked client-side');
  assert.equal(fields.btnSubmitPresensi.disabled, false);

  fields.inputJabatanTamu.value = '  Kepala Bidang Koperasi  ';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].payload.jabatan, 'Kepala Bidang Koperasi');

  // Switching back to Diskum or OPD_Pemko clears Tamu_Luar customValidity and does not require Jabatan di OPD
  fields.selectRapat.value = '7001';
  context.onPresensiAgendaChange();
  context.setKategoriPeserta('Tamu_Luar');
  fields.inputNamaTamu.value = 'Tamu Eksternal';
  fields.inputInstansiTamu.value = 'Dinas Provinsi';
  fields.inputJabatanTamu.value = '   ';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 1, 'non-roster Tamu_Luar also blocks whitespace Jabatan');

  context.setKategoriPeserta('OPD_Pemko');
  assert.equal(fields.inputJabatanTamu.required, false);
  assert.equal(fields.inputJabatanTamu.customValidity, '');
  fields.selectOpdPemko.value = 'Dinas Kesehatan Kota Batam';
  context.onOpdPemkoChange();
  fields.inputNamaPemko.value = 'Pegawai Pemko';
  context.document.getElementById('inputJabatanPemko').value = '';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 2, 'OPD_Pemko Jabatan di OPD stays optional');
});

test('GAS and local server reject missing/whitespace Jabatan for TLD Presensi while preserving Pemko/Diskum/manual optional Jabatan', async () => {
  const visitRow = Array(20).fill('');
  visitRow[0] = 1;
  visitRow[1] = 'TLD-02112026-001';
  visitRow[2] = 'luar_daerah';
  visitRow[3] = 'Dinas Koperasi Kab. Uji';
  visitRow[5] = 2;
  visitRow[6] = 'Ketua Terdaftar';
  visitRow[7] = 'Anggota Satu';
  visitRow[12] = '2026-11-02';
  visitRow[13] = '09:00';
  visitRow[19] = 'Menunggu Kedatangan';
  const wfState = {
    version: 1,
    status: 'Menunggu Kedatangan',
    booking: { id: 9, kode_rapat: 'VISIT-TLD-02112026-001', tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '11:00' },
    files: {},
    history: []
  };
  const { context, presensiSheet } = createGasContext({
    visits: [visitRow],
    meetings: [
      [9, 'VISIT-TLD-02112026-001', 'Kunjungan Uji', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '09:00', '11:00', 'Sekretariat', 'PIC', 2, 'Agenda', 'Terjadwal', ''],
      [10, 'RPT-10', 'Rapat Internal', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '13:00', '14:00', 'Sekretariat', 'PIC', 5, 'Agenda', 'Terjadwal', '']
    ],
    workflows: [['TLD-02112026-001', 1, JSON.stringify(wfState), '2026-11-02T08:00:00Z']]
  });

  // GAS rejects missing & whitespace-only jabatan on TLD QR & AdminEntry
  assert.equal(context.submitPresensiRapat({ rapat_id: 9, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jabatan: '' }).success, false);
  assert.equal(context.submitPresensiRapat({ rapat_id: 9, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jabatan: '   ' }).success, false);
  assert.equal(context.submitAdminPresensiRapat({ rapat_id: 9, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jam_kehadiran: '09:10', jabatan: '  ' }).success, false);
  assert.equal(context.submitPresensiRapat({ rapat_id: 10, kategori_peserta: 'Tamu_Luar', nama: 'Tamu Luar', nama_opd: 'Instansi A', jabatan: '   ' }).success, false);
  assert.equal(presensiSheet.rows.length, 0);

  // GAS accepts valid jabatan on TLD, optional jabatan on OPD_Pemko, and optional jabatan on Admin Presensi Manual
  assert.equal(context.submitPresensiRapat({ rapat_id: 9, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jabatan: 'Ketua Tim' }).success, true);
  assert.equal(context.submitManualVisitAttendance({ rapat_id: 9, member_ids: ['anggota-1'] }).success, true);
  assert.equal(context.submitPresensiRapat({ rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Pejabat Pemko', opd_pemko: 'Dinas Kesehatan Kota Batam', jabatan: '' }).success, true);

  // Local HTTP server parity
  const server = createLocalTestServer({ now: () => new Date('2026-11-02T12:00:00Z') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => (await fetch(`${base}/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })).json();
  try {
    const reg = await rpc('registerTamuLuar', completeTldPayload({
      ketua_nama: 'Ketua Local',
      pengikut_list: 'Anggota Local',
      jumlah_orang: 2,
      tanggal_kunjungan: '2026-11-02'
    }));
    const code = reg.data.kode_kunjungan;
    const wf0 = (await rpc('getVisitWorkflow', { kode_kunjungan: code })).data;
    const act = async (action, extra, v) => (await rpc('saveVisitWorkflow', { kode_kunjungan: code, version: v, action, ...extra })).data;
    let d = await act('destinations', { destinations: ['UPTD PLUT KUMKM'] }, wf0.workflow.version);
    d = await act('confirm', {}, d.workflow.version);
    d = await act('disposisi', { file: { name: 'd.pdf', data: 'data:application/pdf;base64,JVBERg==' } }, d.workflow.version);
    d = await act('notify', {}, d.workflow.version);
    d = await act('book', { booking: { ruangan_id: 6001, tanggal: '2026-11-02', jam_mulai: '15:00', jam_selesai: '16:00' } }, d.workflow.version);
    const rapatId = d.workflow.booking.id;

    const badQr = await rpc('submitPresensiRapat', { rapat_id: rapatId, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jabatan: '  ' });
    assert.equal(badQr.success, false);
    const badAdmin = await rpc('submitAdminPresensiRapat', { rapat_id: rapatId, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jam_kehadiran: '15:05', jabatan: '' });
    assert.equal(badAdmin.success, false);
    const goodQr = await rpc('submitPresensiRapat', { rapat_id: rapatId, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jabatan: 'Kepala Seksi' });
    assert.equal(goodQr.success, true, goodQr.error);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('hierarchy sorting handles leaders, unit order, equal/unknown ranks, and preserves registration order without inventing ranks or mutating Data_Presensi', () => {
  const dir = JSON.parse(fs.readFileSync(path.join(ROOT, 'local-test/previews/employee-directory.json'), 'utf8'));
  const employeeRows = dir.map((e, i) => [i + 1, e.nip, e.nama, e.jabatan, e.bidang, 0, 0, 'Aktif', e.pangkat]);

  // Deliberately pre-sorted DESC (as GAS autoSortPresensi does) with same-minute timestamps & unknown/external ranks.
  const storedRows = [
    [6, 9, 'Rapat Gabungan', 'Tamu_Luar', 'Tamu Staf Awal', '-', 'Staf Pelaksana', 'Pemkab Lain', '', '2026-11-02 08:05:00', 'anggota-1', 'QR', '2026-11-02 08:05:00'],
    [5, 9, 'Rapat Gabungan', 'Tamu_Luar', 'Tamu Kadis Belakangan', '-', 'Kepala Dinas', 'Pemkab Lain', '', '2026-11-02 08:05:40', 'ketua', 'QR', '2026-11-02 08:05:40'],
    [4, 9, 'Rapat Gabungan', 'Diskum', 'Diskum Tidak Terdaftar B', '-', 'Tenaga Ahli', 'Diskum Batam', '', '2026-11-02 08:04:50', '', 'QR', '2026-11-02 08:04:50'],
    [3, 9, 'Rapat Gabungan', 'Diskum', 'Diskum Tidak Terdaftar A', '-', 'Staf Honorer', 'Diskum Batam', '', '2026-11-02 08:04:10', '', 'QR', '2026-11-02 08:04:10'],
    [2, 9, 'Rapat Gabungan', 'Diskum', 'Vinggo Sepco Putra, A.Md.', '19960913 202203 1 003', 'Pengolah Data dan Informasi', 'Diskum Batam', '', '2026-11-02 08:10:00', '', 'QR', '2026-11-02 08:10:00'],
    [1, 9, 'Rapat Gabungan', 'Diskum', 'Adrial, S.K.M, M.K.M.', '19710520 199403 1 009', 'Sekretaris', 'Diskum Batam', '', '2026-11-02 08:20:00', '', 'QR', '2026-11-02 08:20:00'],
    [7, 9, 'Rapat Gabungan', 'Diskum', 'Salim, S.Sos, M.Si', '19681021 199010 1 001', 'Kepala Dinas', 'Diskum Batam', '', '2026-11-02 08:30:00', '', 'QR', '2026-11-02 08:30:00']
  ];
  const snapshotBefore = JSON.stringify(storedRows);

  const { context, presensiSheet } = createGasContext({
    meetings: [[9, 'RPT-9', 'Rapat Gabungan', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '08:00', '10:00', 'Dinas', 'Salim', 10, 'Koordinasi', 'Terjadwal', '']],
    attendance: storedRows,
    employees: employeeRows
  });

  const view = context.getAgendaAttendance({ rapat_id: 9 });
  assert.equal(view.success, true, view.error);
  assert.deepEqual(view.data.attendance.map(r => r.nama), [
    'Salim, S.Sos, M.Si',         // Leader #1
    'Adrial, S.K.M, M.K.M.',      // Leader #2
    'Vinggo Sepco Putra, A.Md.',  // Ranked staff in Master_Pegawai
    'Diskum Tidak Terdaftar A',   // Unknown rank 08:04:10 (before 08:04:50 even though sheet row was after)
    'Diskum Tidak Terdaftar B',   // Unknown rank 08:04:50
    'Tamu Staf Awal',             // External TLD 08:05:00 (not overtaken by "Kepala Dinas" text!)
    'Tamu Kadis Belakangan'       // External TLD 08:05:40
  ]);

  // Stored sheet records must remain completely untouched
  assert.equal(JSON.stringify(presensiSheet.rows), snapshotBefore);

  // Equal/missing timestamps preserve stable input order across external TLD, TDD, and Pemko without Jabatan or Diskum-name ranking
  const stable = context.makeAgendaAttendanceList_([
    { kategori: 'Tamu_Luar', nama: 'Salim, S.Sos, M.Si', jabatan: 'Kepala Dinas Luar', waktu: '' },
    { kategori: 'TDD', nama: 'Tamu TDD Pertama', jabatan: 'Staf', waktu: '' },
    { kategori: 'OPD_Pemko', nama: 'Peserta Pemko Sekda', jabatan: 'Sekretaris Daerah', waktu: '' },
    { kategori: '', member_id: 'ketua', nama: 'Adrial, S.K.M, M.K.M.', jabatan: 'Ketua Rombongan', waktu: '' }
  ], 'Asia/Jakarta', { employees: dir });
  assert.deepEqual(stable.map(r => r.nama), [
    'Salim, S.Sos, M.Si',
    'Tamu TDD Pertama',
    'Peserta Pemko Sekda',
    'Adrial, S.K.M, M.K.M.'
  ]);

  // Mixed Internal Diskum + external TLD/TDD/Pemko: Diskum sorted by hierarchy; externals keep chronological/registration order after Diskum
  const mixed = context.sortAttendanceRecords_([
    { kategori: 'OPD_Pemko', nama: 'Pemko Pertama', jabatan: 'Sekretaris Daerah', waktu: '2026-10-26 08:00:00' },
    { kategori: 'TDD', nama: 'TDD Kedua', jabatan: 'Kepala Dinas', waktu: '2026-10-26 08:01:00' },
    { kategori: 'Tamu_Luar', nama: 'TLD Ketiga', jabatan: 'Staf', waktu: '2026-10-26 08:02:00' },
    { kategori: 'Diskum', nama: 'Vinggo Sepco Putra, A.Md.', nip: '19960913 202203 1 003', jabatan: 'Pengolah Data dan Informasi', waktu: '2026-10-26 08:20:00' },
    { kategori: 'Internal', nama: 'Salim, S.Sos, M.Si', nip: '19681021 199010 1 001', jabatan: 'Kepala Dinas', waktu: '2026-10-26 08:30:00' }
  ], 'Asia/Jakarta', { employees: dir });
  assert.deepEqual(mixed.map(r => r.nama), [
    'Salim, S.Sos, M.Si',
    'Vinggo Sepco Putra, A.Md.',
    'Pemko Pertama',
    'TDD Kedua',
    'TLD Ketiga'
  ]);
});

test('attendance ordering is consistent across Lihat Presensi (getAgendaAttendance), Presensi list (getVisitWorkflow), and attendance exports (Daftar_Hadir PDF) in GAS and local workflow', async () => {
  const dir = JSON.parse(fs.readFileSync(path.join(ROOT, 'local-test/previews/employee-directory.json'), 'utf8'));
  const employeeRows = dir.map((e, i) => [i + 1, e.nip, e.nama, e.jabatan, e.bidang, 0, 0, 'Aktif', e.pangkat]);

  const visitRow = Array(20).fill('');
  visitRow[0] = 1;
  visitRow[1] = 'TLD-02112026-009';
  visitRow[2] = 'luar_daerah';
  visitRow[3] = 'Dinas Koperasi Kab. Tetangga';
  visitRow[5] = 3;
  visitRow[6] = 'Ketua Eksternal';
  visitRow[7] = 'Anggota Satu\nAnggota Dua';
  visitRow[12] = '2026-11-02';
  visitRow[13] = '09:00';
  visitRow[19] = 'Kelola SPPD';

  const wfState = {
    version: 4,
    status: 'Kelola SPPD',
    booking: { id: 50, kode_rapat: 'VISIT-TLD-02112026-009', tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '11:00' },
    arrival: { at: '2026-11-02T11:30:00Z', actor: 'Admin' },
    files: { foto: { name: 'foto.jpg', url: 'https://drive.google.com/file/d/foto/view' } },
    history: []
  };

  // GAS Data_Presensi in reverse chronological order (as left by autoSortPresensi) + mixed Diskum/TLD rows
  const storedAttendance = [
    [4, 50, 'Kunjungan', 'Tamu_Luar', 'Ketua Eksternal', '-', 'Ketua Rombongan', 'Dinas Koperasi Kab. Tetangga', '', '2026-11-02 09:05:00', 'ketua', 'QR', '2026-11-02 09:05:00'],
    [3, 50, 'Kunjungan', 'Tamu_Luar', 'Anggota Satu', '-', 'Kepala Bidang', 'Dinas Koperasi Kab. Tetangga', '', '2026-11-02 09:02:00', 'anggota-1', 'QR', '2026-11-02 09:02:00'],
    [2, 50, 'Kunjungan', 'Diskum', 'Afrinaldi', '19890917 202521 1 023', 'Pengadministrasi Perkantoran', 'Diskum Batam', '', '2026-11-02 09:10:00', '', 'QR', '2026-11-02 09:10:00'],
    [1, 50, 'Kunjungan', 'Diskum', 'Salim, S.Sos, M.Si', '19681021 199010 1 001', 'Kepala Dinas', 'Diskum Batam', '', '2026-11-02 09:15:00', '', 'QR', '2026-11-02 09:15:00']
  ];

  const { context } = createGasContext({
    visits: [visitRow],
    meetings: [[50, 'VISIT-TLD-02112026-009', 'Kunjungan Dinas Koperasi Kab. Tetangga', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '09:00', '11:00', 'Sekretariat', 'PIC', 3, 'Koordinasi', 'Terjadwal', '']],
    attendance: storedAttendance,
    employees: employeeRows,
    workflows: [['TLD-02112026-009', 4, JSON.stringify(wfState), '2026-11-02T11:30:00Z']]
  });

  const expectedOrder = [
    'Salim, S.Sos, M.Si',
    'Afrinaldi',
    'Anggota Satu',
    'Ketua Eksternal'
  ];

  // 1. Lihat Presensi (getAgendaAttendance)
  const lihatRes = context.getAgendaAttendance({ rapat_id: 50 });
  assert.equal(lihatRes.success, true, lihatRes.error);
  assert.deepEqual(lihatRes.data.attendance.map(r => r.nama), expectedOrder);

  // 2. Visit workflow Presensi list (getVisitWorkflow full & tab 3)
  const wfFull = context.getVisitWorkflow({ kode_kunjungan: 'TLD-02112026-009' });
  assert.equal(wfFull.success, true, wfFull.error);
  assert.deepEqual(wfFull.data.attendance.map(r => r.nama), expectedOrder);

  const wfTab3 = context.getVisitWorkflow({ kode_kunjungan: 'TLD-02112026-009', tab: 3 });
  assert.equal(wfTab3.success, true, wfTab3.error);
  assert.deepEqual(wfTab3.data.attendance.map(r => r.nama), expectedOrder);

  // 3. GAS Attendance export HTML (Daftar_Hadir_<kode>.pdf via saveVisitWorkflow finish & buildVisitAttendanceHtml_)
  const htmlCaptures = [];
  context.HtmlService = {
    createHtmlOutput: html => {
      htmlCaptures.push(html);
      return { getBlob: () => ({ getAs: () => ({ setName: name => ({ getName: () => name, getBytes: () => [37, 80, 68, 70] }) }) }) };
    }
  };
  context.MimeType = { PDF: 'application/pdf' };
  const finishedGas = context.saveVisitWorkflow({
    kode_kunjungan: 'TLD-02112026-009',
    version: wfFull.data.workflow.version,
    action: 'finish',
    note: 'Kunjungan selesai di GAS.'
  });
  assert.equal(finishedGas.success, true, finishedGas.error);
  const exportHtml = htmlCaptures[0] || context.buildVisitAttendanceHtml_(wfFull.data);
  const pos = expectedOrder.map(name => exportHtml.indexOf(name));
  assert.ok(pos.every(p => p >= 0), 'all attendees appear in GAS Daftar Hadir export');
  for (let i = 1; i < pos.length; i++) {
    assert.ok(pos[i - 1] < pos[i], `GAS export order mismatch at index ${i}`);
  }

  // 4. Local fixture store consistency (getAgendaAttendance, getVisitWorkflow, and jsPDF Daftar_Hadir_<kode>.pdf)
  const store = createFixtureStore(new Date('2026-11-02T12:00:00Z'));
  const reg = store.handleMutation('registerTamuLuar', completeTldPayload({
    ketua_nama: 'Ketua Local Konsisten',
    pengikut_list: 'Anggota Pertama\nAnggota Kedua',
    jumlah_orang: 3,
    tanggal_kunjungan: '2026-11-02'
  }));
  const code = reg.data.kode_kunjungan;
  let d = store.handleMutation('getVisitWorkflow', { kode_kunjungan: code }).data;
  for (const [action, extra] of [
    ['destinations', { destinations: ['UPTD PLUT KUMKM'] }],
    ['confirm', {}],
    ['disposisi', { file: { name: 'd.pdf', data: 'data:application/pdf;base64,JVBERg==' } }],
    ['notify', {}],
    ['book', { booking: { ruangan_id: 6001, tanggal: '2026-11-02', jam_mulai: '08:00', jam_selesai: '09:00' } }]
  ]) {
    d = store.handleMutation('saveVisitWorkflow', { kode_kunjungan: code, version: d.workflow.version, action, ...extra }).data;
  }
  const agendaId = d.workflow.booking.id;

  // Anggota Kedua checks in before Ketua Local Konsisten (QR)
  assert.equal(store.handleMutation('submitAdminPresensiRapat', {
    rapat_id: agendaId, member_id: 'anggota-2', kategori_peserta: 'Tamu_Luar', jam_kehadiran: '08:05', jabatan: 'Staf'
  }).success, true);
  assert.equal(store.handleMutation('submitAdminPresensiRapat', {
    rapat_id: agendaId, member_id: 'ketua', kategori_peserta: 'Tamu_Luar', jam_kehadiran: '08:15', jabatan: 'Kepala Dinas'
  }).success, true);

  const localExpected = ['Anggota Kedua', 'Ketua Local Konsisten'];
  const localLihat = store.handleMutation('getAgendaAttendance', { rapat_id: agendaId });
  assert.deepEqual(localLihat.data.attendance.map(r => r.nama), localExpected);

  const localWf = store.handleMutation('getVisitWorkflow', { kode_kunjungan: code });
  assert.deepEqual(localWf.data.attendance.map(r => r.nama), localExpected);

  d = store.handleMutation('saveVisitWorkflow', { kode_kunjungan: code, version: d.workflow.version, action: 'arrival' }).data;
  d = store.handleMutation('saveVisitWorkflow', { kode_kunjungan: code, version: d.workflow.version, action: 'evidence', files: { foto: { name: 'f.jpg', data: 'data:image/jpeg;base64,/9j/2Q==' } } }).data;
  d = store.handleMutation('saveVisitWorkflow', { kode_kunjungan: code, version: d.workflow.version, action: 'finish', note: 'Selesai uji konsistensi.' }).data;
  const pdfText = store.getDocument(d.workflow.files.absen.url.split('/').pop()).buffer.toString('latin1');
  assert.ok(pdfText.indexOf('Anggota Kedua') >= 0 && pdfText.indexOf('Ketua Local Konsisten') >= 0);
  assert.ok(pdfText.indexOf('Anggota Kedua') < pdfText.indexOf('Ketua Local Konsisten'));

  // 5. Local HTTP served Presensi pages include red * on Jabatan and HTTP API endpoints stay consistent
  const server = createLocalTestServer({
    now: () => new Date('2026-11-03T12:00:00Z'),
    seed({ visitors, meetings, sppd, visitWorkflow, rooms }) {
      const visit = {
        id: 1, kode_kunjungan: 'TLD-02112026-001', tipe_tamu: 'luar_daerah', instansi: 'Dinas Koperasi Uji HTTP',
        alamat: 'Batam', jumlah_orang: 2, ketua_nama: 'Ketua HTTP', pengikut_list: 'Anggota HTTP',
        tujuan_bidang: 'Sekretariat', keperluan: 'Koordinasi', narahubung_hp: '081200000001',
        tanggal_kunjungan: '2026-11-02', jam_kunjungan: '09:00', lo_id: '', lo_nama: 'PIC HTTP',
        bawa_sppd: true, status_kunjungan: 'Selesai'
      };
      visitors.push(visit);
      sppd.push({ id: 1, tamu_id: 1, kode_kunjungan: visit.kode_kunjungan, instansi: visit.instansi, ketua_nama: visit.ketua_nama, file_foto: '/f', file_absen: '/a', file_notulen: '/n', status_sppd: 'Sah & Terverifikasi', disetujui_kasubag: 1, waktu_persetujuan_kasubag: '2026-11-02 15:00:00' });
      const booking = { id: 101, kode_rapat: 'VISIT-' + visit.kode_kunjungan, judul_rapat: 'Kunjungan HTTP', ruangan_id: rooms[0].id, nama_ruangan: rooms[0].nama_ruangan, tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '10:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'PIC HTTP', jumlah_peserta: 2, agenda: 'Koordinasi', status: 'Selesai', kode_kunjungan: visit.kode_kunjungan };
      meetings.push(booking);
      visitWorkflow.seedVisit(visit, { version: 5, status: 'Selesai', booking, destinations: { bidang: visit.tujuan_bidang, pic: visit.lo_nama, picIds: '' }, files: {}, history: [] }, [
        { id: 1, rapat_id: 101, kategori: 'Tamu_Luar', nama: 'Ketua HTTP', jabatan: 'Ketua', nama_opd: visit.instansi, waktu: '2026-11-02 09:05:00', member_id: 'ketua' },
        { id: 2, rapat_id: 101, kategori: 'Tamu_Luar', nama: 'Anggota HTTP', jabatan: 'Anggota', nama_opd: visit.instansi, waktu: '2026-11-02 09:10:00', member_id: 'anggota-1' }
      ]);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of ['page=presensi', 'page=presensi-admin']) {
      const pageHtml = await (await fetch(`${base}/?${query}`)).text();
      assert.match(pageHtml, /<label[^>]*for="inputJabatanTamu"[^>]*>[\s\S]*?text-rose-600[^>]*>\*<\/span>/);
    }
    const rpc = async (name, body = {}) => (await fetch(`${base}/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })).json();
    const visit = (await rpc('getTamuList')).data.find(v => v.tipe_tamu === 'luar_daerah' && v.status_kunjungan === 'Selesai');
    assert.ok(visit);
    const httpWf = (await rpc('getVisitWorkflow', { kode_kunjungan: visit.kode_kunjungan })).data;
    const httpLihat = (await rpc('getAgendaAttendance', { rapat_id: httpWf.workflow.booking.id })).data;
    assert.deepEqual(
      httpLihat.attendance.map(r => r.nama),
      httpWf.attendance.map(r => r.nama)
    );
  } finally {
    server.close();
    await once(server, 'close');
  }
});
