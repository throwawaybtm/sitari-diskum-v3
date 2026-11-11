'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer } = require('../server');

const ROOT = path.resolve(__dirname, '../..');

const EXPECTED_PEMKO_OPD_38 = [
  'Asisten Pemerintahan dan Kesejahteraan Rakyat',
  'Asisten Administrasi Umum',
  'Asisten Perekonomian dan Pembangunan',
  'Sekretariat Daerah Kota Batam',
  'Sekretariat DPRD Kota Batam',
  'Inspektorat Daerah Kota Batam',
  'Badan Kepegawaian Dan Pengembangan Sumber Daya Manusia Kota Batam',
  'Badan Pendapatan Daerah Kota Batam',
  'Badan Pengelolaan Keuangan Dan Aset Daerah Kota Batam',
  'Badan Perencanaan Pembangunan Daerah Kota Batam',
  'Dinas Kependudukan Dan Pencatatan Sipil Kota Batam',
  'Dinas Kesehatan Kota Batam',
  'Dinas Penanaman Modal Dan Pelayanan Terpadu Satu Pintu Kota Batam',
  'Dinas Pendidikan Kota Batam',
  'Dinas Pertanahan Kota Batam',
  'Dinas Perumahan, Kawasan Permukiman Dan Pertanaman Kota Batam',
  'Badan Kesatuan Bangsa Dan Politik Kota Batam',
  'Badan Penanggulangan Bencana Daerah Kota Batam',
  'Badan Riset Dan Inovasi Daerah Kota Batam',
  'Dinas Bina Marga Dan Sumber Daya Air Kota Batam',
  'Dinas Cipta Karya Dan Tata Ruang Kota Batam',
  'Dinas Kebudayaan Dan Pariwisata Kota Batam',
  'Dinas Kepemudaan Dan Olahraga Kota Batam',
  'Dinas Ketahanan Pangan Dan Pertanian Kota Batam',
  'Dinas Komunikasi Dan Informatika Kota Batam',
  'Dinas Lingkungan Hidup Kota Batam',
  'Dinas Pemadam Kebakaran Dan Penyelamatan Kota Batam',
  'Dinas Pemberdayaan Perempuan, Perlindungan Anak, Pengendalian Penduduk Dan Keluarga Berencana Kota Batam',
  'Dinas Perhubungan Kota Batam',
  'Dinas Perikanan Kota Batam',
  'Dinas Perindustrian Dan Perdagangan Kota Batam',
  'Dinas Perpustakaan Dan Kearsipan Kota Batam',
  'Dinas Sosial Dan Pemberdayaan Masyarakat Kota Batam',
  'Dinas Tenaga Kerja Kota Batam',
  'Rumah Sakit Umum Daerah Embung Fatimah Kota Batam',
  'Satuan Polisi Pamong Praja Kota Batam',
  'Kelurahan',
  'Kecamatan'
];

function createPresensiVm({ admin = false, masterOpd = [{ id: 1, nama_opd: 'OPD Lama Sheet' }], failMaster = false } = {}) {
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
    const initialClasses = id === 'pemkoWilayahField' || id === 'sectionPemko' || id === 'sectionTamu' ? ['hidden'] : [];
    const base = {
      value: '',
      required: false,
      disabled: false,
      hidden: id === 'pemkoWilayahField',
      readOnly: false,
      placeholder: '',
      textContent: '',
      innerText: '',
      innerHTML: '',
      options: [],
      customValidity: '',
      classList: makeClassList(initialClasses),
      setCustomValidity(msg) { this.customValidity = String(msg || ''); },
      replaceChildren(...items) { this.options = items; this.value = items[0] ? String(items[0].value) : ''; },
      add(item) { this.options.push(item); },
      reportValidity() { return !this.customValidity; }
    };
    return base;
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
      constructor(text, value = text, defaultSelected = false, selected = false) {
        this.text = text;
        this.value = value;
        this.defaultSelected = defaultSelected;
        this.selected = selected;
      }
    },
    alert: msg => alerts.push(msg),
    console: { error() {}, warn() {} },
    location: { reload() {} }
  });

  // Wire formPresensi.reportValidity to check required/customValidity on visible controls.
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

  context.callBackend = (name, args, success, error) => {
    if (name === 'getRapatCalendar') {
      success({
        success: true,
        data: [{
          id: 7001,
          tanggal: '2026-10-26',
          jam_mulai: '09:30',
          jam_selesai: '11:00',
          judul_rapat: 'Rapat Koordinasi Daerah',
          nama_ruangan: 'Ruang Rapat Utama Diskum'
        }]
      });
      return;
    }
    if (name === 'getMasterData') {
      if (failMaster) {
        error(new Error('Simulasi gagal'));
      } else {
        success({
          success: true,
          data: {
            pegawai: [{ id: 8001, nama: 'Pegawai Uji', nip: '1990', jabatan: 'Analis', bidang: 'Sekretariat' }],
            opd: masterOpd
          }
        });
      }
    }
  };

  context.loadInitialData();
  return { html, context, fields, alerts };
}

test('Presensi Pemko OPD dropdown contains the exact 38 entries in screenshot order and resists Master_OPD drift', () => {
  assert.equal(EXPECTED_PEMKO_OPD_38.length, 38);

  const { html, fields } = createPresensiVm({ masterOpd: [{ id: 99, nama_opd: 'OPD Lama Dari Sheet' }] });
  const options = fields.selectOpdPemko.options.map(o => ({ text: o.text, value: o.value }));
  assert.equal(options[0].text, '-- Pilih OPD Pemko Batam --');
  assert.equal(options[0].value, '');
  assert.deepEqual(
    options.slice(1).map(o => o.text),
    EXPECTED_PEMKO_OPD_38,
    'Exact 38 OPD labels and ordering must be preserved without alphabetical sorting'
  );
  assert.deepEqual(
    options.slice(1).map(o => o.value),
    EXPECTED_PEMKO_OPD_38
  );

  // Even when getMasterData fails, the 38 Pemko OPD entries remain available.
  const failed = createPresensiVm({ failMaster: true });
  assert.deepEqual(
    failed.fields.selectOpdPemko.options.slice(1).map(o => o.text),
    EXPECTED_PEMKO_OPD_38
  );

  // Conditional input container is placed directly below selectOpdPemko in sectionPemko.
  const pemkoHtml = html.match(/<div id="sectionPemko"[\s\S]*?<label for="inputNamaPemko"/)?.[0] || '';
  assert.match(pemkoHtml, /<select id="selectOpdPemko"[\s\S]*?<\/select>[\s\S]*?id="pemkoWilayahField"[\s\S]*?id="inputWilayahPemko"/);
});

test('Kelurahan and Kecamatan reveal one required field below dropdown; other selections hide, unrequire, and clear it', () => {
  const { context, fields } = createPresensiVm();
  context.setKategoriPeserta('OPD_Pemko');

  assert.equal(fields.pemkoWilayahField.hidden, true);
  assert.equal(fields.pemkoWilayahField.classList.contains('hidden'), true);
  assert.equal(fields.inputWilayahPemko.required, false);

  // Selecting Kelurahan reveals required Nama Kelurahan
  fields.selectOpdPemko.value = 'Kelurahan';
  context.onOpdPemkoChange();
  assert.equal(fields.pemkoWilayahField.hidden, false);
  assert.equal(fields.pemkoWilayahField.classList.contains('hidden'), false);
  assert.equal(fields.labelWilayahPemkoText.textContent, 'Nama Kelurahan');
  assert.equal(fields.inputWilayahPemko.required, true);

  // Entering a Kelurahan name, then switching to Kecamatan clears old value and updates label
  fields.inputWilayahPemko.value = 'Baloi Permai';
  fields.selectOpdPemko.value = 'Kecamatan';
  context.onOpdPemkoChange();
  assert.equal(fields.pemkoWilayahField.hidden, false);
  assert.equal(fields.labelWilayahPemkoText.textContent, 'Nama Kecamatan');
  assert.equal(fields.inputWilayahPemko.required, true);
  assert.equal(fields.inputWilayahPemko.value, '');

  // Entering a Kecamatan name, then selecting another OPD hides and clears it
  fields.inputWilayahPemko.value = 'Lubuk Baja';
  fields.selectOpdPemko.value = 'Dinas Kesehatan Kota Batam';
  context.onOpdPemkoChange();
  assert.equal(fields.pemkoWilayahField.hidden, true);
  assert.equal(fields.pemkoWilayahField.classList.contains('hidden'), true);
  assert.equal(fields.inputWilayahPemko.required, false);
  assert.equal(fields.inputWilayahPemko.value, '');

  // Switching participant category away from OPD_Pemko unrequires conditional field so other flows submit cleanly
  fields.selectOpdPemko.value = 'Kelurahan';
  context.onOpdPemkoChange();
  assert.equal(fields.inputWilayahPemko.required, true);
  context.setKategoriPeserta('Diskum');
  assert.equal(fields.inputWilayahPemko.required, false);
  context.setKategoriPeserta('Tamu_Luar');
  assert.equal(fields.inputWilayahPemko.required, false);
  context.setKategoriPeserta('OPD_Pemko');
  assert.equal(fields.inputWilayahPemko.required, true);
});

test('Presensi Pemko submission validates required specific name and sends canonical category + specific name', () => {
  const { context, fields } = createPresensiVm();
  const submitted = [];
  context.callBackend = (name, args, success) => {
    submitted.push({ name, payload: args[0] });
    success({ success: true, message: 'Berhasil' });
  };

  fields.selectRapat.value = '7001';
  context.setKategoriPeserta('OPD_Pemko');
  fields.inputNamaPemko.value = 'Dewi Anggraini, S.E.';

  // 1. Kelurahan with whitespace-only specific name is rejected before backend call
  fields.selectOpdPemko.value = 'Kelurahan';
  context.onOpdPemkoChange();
  fields.inputWilayahPemko.value = '   ';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 0);

  // 2. Valid Kelurahan submission sends both category and specific name in nama_opd
  fields.inputWilayahPemko.value = 'Baloi Permai';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].payload.kategori_peserta, 'OPD_Pemko');
  assert.equal(submitted[0].payload.opd_pemko, 'Kelurahan');
  assert.equal(submitted[0].payload.opd_pemko_wilayah, 'Baloi Permai');
  assert.equal(submitted[0].payload.nama_opd, 'Kelurahan - Baloi Permai');

  // 3. Valid Kecamatan submission
  fields.selectOpdPemko.value = 'Kecamatan';
  context.onOpdPemkoChange();
  fields.inputWilayahPemko.value = 'Lubuk Baja';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 2);
  assert.equal(submitted[1].payload.opd_pemko, 'Kecamatan');
  assert.equal(submitted[1].payload.opd_pemko_wilayah, 'Lubuk Baja');
  assert.equal(submitted[1].payload.nama_opd, 'Kecamatan - Lubuk Baja');

  // 4. Standard OPD submission sends exact spelling without wilayah
  fields.selectOpdPemko.value = 'Dinas Perumahan, Kawasan Permukiman Dan Pertanaman Kota Batam';
  context.onOpdPemkoChange();
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 3);
  assert.equal(submitted[2].payload.opd_pemko, 'Dinas Perumahan, Kawasan Permukiman Dan Pertanaman Kota Batam');
  assert.equal(submitted[2].payload.opd_pemko_wilayah, undefined);
  assert.equal(submitted[2].payload.nama_opd, 'Dinas Perumahan, Kawasan Permukiman Dan Pertanaman Kota Batam');
});

test('GAS backend validates Pemko OPD submissions, persists Data_Presensi row, and exposes OPD in getMasterData & getAgendaAttendance', () => {
  const attendanceRows = [];
  const meetingRow = [10, 'RPT-10', 'Rapat OPD Pemko', 1, 'Ruang Rapat Utama Diskum', '2026-10-26', '09:00', '11:00', 'Sekretariat', 'Adrial', 20, 'Koordinasi', 'Terjadwal', '2026-10-26 08:00:00'];
  const presensiSheet = {
    getLastRow: () => attendanceRows.length + 1,
    getLastColumn: () => 13,
    getRange: (r, c, n = 1, w = 1) => ({
      getValues: () => attendanceRows.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w)),
      setValues() {},
      setValue() {},
      setNumberFormat() { return this; }
    }),
    appendRow: row => attendanceRows.push(Array.from(row))
  };
  const makeReadSheet = rows => ({
    getLastRow: () => rows.length + 1,
    getLastColumn: () => rows[0] ? rows[0].length : 1,
    getRange: (r, c, n = 1, w = 1) => ({
      getValues: () => rows.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w))
    })
  });
  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => ({
      Data_Rapat: makeReadSheet([meetingRow]),
      Data_Presensi: presensiSheet,
      Master_Pegawai: makeReadSheet([]),
      Master_OPD: makeReadSheet([[1, 'OPD Lama', 'Pemko Batam']]),
      Master_Ruangan: makeReadSheet([[1, 'Ruang Rapat Utama Diskum', 50]])
    })[name] || null
  };

  const context = vm.createContext({
    Date,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-10-26 09:45:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'ADMIN_DEMO_MODE' ? 'true' : null }) },
    CacheService: { getScriptCache: () => { throw new Error('no cache'); } }
  });
  for (const file of ['Code.js', 'MeetingRooms.js', 'VisitWorkflow.js', 'VisitWorkflowStorage.js', 'VisitArchive.js', 'AgendaDocuments.js', 'AgendaAttendanceData.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => ss;
  context.autoSortPresensi = () => {};

  // Master data returns exact 38 entries in exact order
  const master = context.getMasterData();
  assert.equal(master.success, true);
  assert.deepEqual(Array.from(master.data.opd, o => o.nama_opd), EXPECTED_PEMKO_OPD_38);

  // Rejects invalid OPD or missing Kelurahan/Kecamatan name
  assert.equal(context.submitPresensiRapat({ rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Budi', opd_pemko: 'OPD Tidak Valid' }).success, false);
  assert.equal(context.submitPresensiRapat({ rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Budi', opd_pemko: 'Kelurahan', opd_pemko_wilayah: '  ' }).success, false);
  assert.equal(context.submitPresensiRapat({ rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Budi', nama_opd: 'Kecamatan' }).success, false);
  assert.equal(attendanceRows.length, 0);

  // Accepts valid Kelurahan, Kecamatan, and standard OPD; preserves 13-col schema
  const ok1 = context.submitPresensiRapat({
    rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Lurah Uji', jabatan: 'Lurah',
    opd_pemko: 'Kelurahan', opd_pemko_wilayah: 'Tanjung Uma', nama_opd: 'Kelurahan - Tanjung Uma'
  });
  assert.equal(ok1.success, true, ok1.error);
  assert.equal(attendanceRows[0].length, 13);
  assert.equal(attendanceRows[0][7], 'Kelurahan - Tanjung Uma');

  const ok2 = context.submitAdminPresensiRapat({
    rapat_id: 10, kategori_peserta: 'OPD_Pemko', nama: 'Camat Uji', jam_kehadiran: '09:50',
    opd_pemko: 'Kecamatan', opd_pemko_wilayah: 'Kecamatan Batu Ampar'
  });
  assert.equal(ok2.success, true, ok2.error);
  assert.equal(attendanceRows[1][7], 'Kecamatan - Batu Ampar');

  // Legacy existing row (old OPD string + blank OPD row) remain viewable
  attendanceRows.push([3, 10, 'Rapat OPD Pemko', 'OPD_Pemko', 'Peserta Lama', '-', '-', 'Dinas Perdagangan Lama', '', '2026-10-26 09:30:00', '', 'QR', '2026-10-26 09:30:00']);
  attendanceRows.push([4, 10, 'Rapat OPD Pemko', 'Diskum', 'Pegawai Tanpa Unit', '-', '-', '', '', '2026-10-26 09:20:00', '', 'QR', '2026-10-26 09:20:00']);

  const view = context.getAgendaAttendance({ rapat_id: 10 });
  assert.equal(view.success, true, view.error);
  const byName = Object.fromEntries(view.data.attendance.map(r => [r.nama, r]));
  assert.equal(byName['Lurah Uji'].nama_opd, 'Kelurahan - Tanjung Uma');
  assert.equal(byName['Camat Uji'].nama_opd, 'Kecamatan - Batu Ampar');
  assert.equal(byName['Peserta Lama'].nama_opd, 'Dinas Perdagangan Lama');
  assert.equal(byName['Pegawai Tanpa Unit'].nama_opd, '-');
});

test('local HTTP server and Admin AgendaAttendance modal display OPD/Kelurahan/Kecamatan safely and preserve legacy records', async () => {
  const server = createLocalTestServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => (await fetch(`${base}/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })).json();

  try {
    // Served Presensi page contains all 38 entries in exact order
    const presensiHtml = await (await fetch(`${base}/?page=presensi`)).text();
    for (const label of EXPECTED_PEMKO_OPD_38) {
      assert.ok(presensiHtml.includes(label), `Missing option in served Presensi HTML: ${label}`);
    }

    const master = await rpc('getMasterData');
    assert.deepEqual(master.data.opd.map(o => o.nama_opd), EXPECTED_PEMKO_OPD_38);

    const meeting = (await rpc('getRapatCalendar')).data.find(m => !m.kode_kunjungan && m.status === 'Terjadwal' && m.tanggal <= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date()));
    assert.ok(meeting);

    // Reject missing Kelurahan name on local server
    const bad = await rpc('submitPresensiRapat', {
      rapat_id: meeting.id, kategori_peserta: 'OPD_Pemko', nama: 'Penguji', opd_pemko: 'Kelurahan', opd_pemko_wilayah: ' '
    });
    assert.equal(bad.success, false);

    // Submit Kelurahan with special HTML chars to test escaping in Admin modal
    const ok = await rpc('submitPresensiRapat', {
      rapat_id: meeting.id, kategori_peserta: 'OPD_Pemko', nama: 'Siti Aminah',
      opd_pemko: 'Kelurahan', opd_pemko_wilayah: 'Sei Panas <Uji>'
    });
    assert.equal(ok.success, true, ok.error);

    const view = await rpc('getAgendaAttendance', { rapat_id: meeting.id });
    assert.equal(view.success, true, view.error);
    const saved = view.data.attendance.find(r => r.nama === 'Siti Aminah');
    assert.ok(saved);
    assert.equal(saved.nama_opd, 'Kelurahan - Sei Panas <Uji>');

    // Verify Admin AgendaAttendance.html renders OPD / Instansi column and escapes HTML
    const agendaModalHtml = fs.readFileSync(path.join(ROOT, 'Admin/AgendaAttendance.html'), 'utf8');
    const fields = {
      agendaAttendanceModal: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
      agendaAttendanceName: {},
      agendaAttendanceRows: {},
      agendaAttendanceCount: {},
      agendaAttendanceError: { hidden: true },
      agendaAttendanceRefresh: {}
    };
    const modalCtx = vm.createContext({
      allRapatData: [meeting],
      document: { getElementById: id => fields[id] },
      escapeHtml: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      visitRpc: async () => view.data
    });
    vm.runInContext(agendaModalHtml.match(/<script>([^]*?)<\/script>/)[1], modalCtx);
    await modalCtx.openAgendaAttendance(meeting.id);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(agendaModalHtml, /<th scope="col">OPD \/ Instansi<\/th>/);
    assert.match(fields.agendaAttendanceRows.innerHTML, /Kelurahan - Sei Panas &lt;Uji&gt;/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('TLD Presensi (visitRosterMode) and Diskum flows continue submitting cleanly without Pemko OPD interference', () => {
  const { context, fields } = createPresensiVm();
  const submitted = [];
  context.callBackend = (name, args, success) => {
    if (name === 'getVisitAttendanceRoster') {
      success({
        success: true,
        data: {
          instansi: 'Dinas Koperasi Kab. Bintan',
          locked: false,
          roster: [{ id: 'ketua', nama: 'Ketua TLD', peran: 'Ketua Rombongan', attended: false }]
        }
      });
      return;
    }
    submitted.push({ name, payload: args[0] });
    success({ success: true, message: 'Tersimpan' });
  };

  // Switch first to OPD_Pemko with Kelurahan (making inputWilayahPemko required), then select a TLD visit agenda
  context.setKategoriPeserta('OPD_Pemko');
  fields.selectOpdPemko.value = 'Kelurahan';
  context.onOpdPemkoChange();
  assert.equal(fields.inputWilayahPemko.required, true);

  vm.runInContext("presensiMeetings=[{id:900,kode_kunjungan:'TLD-01112026-001',tanggal:'2026-10-26'}];", context);
  fields.selectRapat.value = '900';
  context.onPresensiAgendaChange();
  assert.equal(fields.inputWilayahPemko.required, false);
  fields.selectTamuRombongan.value = 'ketua';
  fields.inputJabatanTamu.value = 'Kepala Bidang';
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].payload.kategori_peserta, 'Tamu_Luar');
  assert.equal(submitted[0].payload.nama_opd, 'Dinas Koperasi Kab. Bintan');
  assert.equal(submitted[0].payload.opd_pemko, undefined);
});
