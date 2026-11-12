'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer, renderAdminHtml } = require('../server');
const { createFixtureStore } = require('../fixtures');

const EXPECTED_RAPAT_PIMPINAN = [
  {
    no: 1,
    nama: 'Salim, S.Sos, M.Si',
    nip: '19681021 199010 1 001',
    pangkat_golongan: 'Pembina Utama Muda - IV/c',
    bidang: 'Dinas'
  },
  {
    no: 2,
    nama: 'Adrial, S.K.M, M.K.M.',
    nip: '19710520 199403 1 009',
    pangkat_golongan: 'Pembina Tingkat I - IV/b',
    bidang: 'Sekretariat'
  },
  {
    no: 3,
    nama: 'Syofya Nora, S.H.I.',
    nip: '19771107 200212 2 007',
    pangkat_golongan: 'Pembina - IV/a',
    bidang: 'Bidang Kewirausahaan'
  },
  {
    no: 4,
    nama: 'Padlinsono, M.Si.',
    nip: '19761206 200212 1 012',
    pangkat_golongan: 'Pembina - IV/a',
    bidang: 'Bidang Pemberdayaan dan Pelindungan Koperasi'
  },
  {
    no: 5,
    nama: 'Eva Corrina, S.E.',
    nip: '19750426 199403 2 003',
    pangkat_golongan: 'Pembina - IV/a',
    bidang: 'Bidang Pengawasan Koperasi'
  },
  {
    no: 6,
    nama: 'Leny Nuriskawaty, S.Si. Apt., M.H.',
    nip: '19780604 200502 2 005',
    pangkat_golongan: 'Pembina - IV/a',
    bidang: 'Bidang Pengembangan Usaha Mikro'
  },
  {
    no: 7,
    nama: 'Zulfahri, S.E., M.M.',
    nip: '19781119 200212 1 003',
    pangkat_golongan: 'Pembina - IV/a',
    bidang: 'UPTD Pengelolaan Dana Bergulir'
  },
  {
    no: 8,
    nama: 'Meydiana Esterawaty Jastina, S.E.',
    nip: '19760521 201001 2 002',
    pangkat_golongan: 'Penata Tingkat I - III/d',
    bidang: 'UPTD PLUT KUMKM'
  },
  {
    no: 9,
    nama: 'Zuziani, S.E.',
    nip: '19810902 200212 2 004',
    pangkat_golongan: 'Penata Tingkat I - III/d',
    bidang: 'Subbagian Keuangan dan Aset'
  },
  {
    no: 10,
    nama: 'Maslinda, S.E.',
    nip: '19750525 200212 2 015',
    pangkat_golongan: 'Penata Tingkat I - III/d',
    bidang: 'Subbagian Perencanaan Program'
  },
  {
    no: 11,
    nama: 'Septia Yorita, S.E.',
    nip: '19810906 200901 2 002',
    pangkat_golongan: 'Penata - III/c',
    bidang: 'Subbagian Umum dan Kepegawaian'
  },
  {
    no: 12,
    nama: 'Intan Permata Sari, S.E.',
    nip: '19810322 200604 2 012',
    pangkat_golongan: 'Penata Tingkat I - III/d',
    bidang: 'Subbagian Tata Usaha UPTD Pengelolaan Dana Bergulir'
  },
  {
    no: 13,
    nama: 'Hafidz Qodli Abdillah, S.E.',
    nip: '19920215 202012 1 005',
    pangkat_golongan: 'Penata Muda Tingkat I - III/b',
    bidang: 'Subbagian Tata Usaha UPTD PLUT KUMKM'
  }
];

function createSelectElement() {
  const options = [];
  let selectedValue = '';
  return {
    get options() {
      return options;
    },
    get value() {
      return selectedValue;
    },
    set value(next) {
      const text = String(next ?? '');
      selectedValue = options.some(opt => opt.value === text) ? text : '';
    },
    replaceChildren(...nodes) {
      options.length = 0;
      options.push(...nodes);
      selectedValue = options[0] ? options[0].value : '';
    },
    add(option) {
      options.push(option);
    }
  };
}

function loadRapatPimpinanHarness() {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const selectBidang = createSelectElement();
  const selectRuangan = createSelectElement();
  selectRuangan.disabled = false;
  const inputPimpinan = { value: '', readOnly: false, disabled: false };
  const form = {
    resetCalls: 0,
    reset() {
      this.resetCalls++;
      selectBidang.value = '';
      inputPimpinan.value = '';
    }
  };
  const modal = {
    classes: new Set(['hidden']),
    classList: {
      add: (...names) => names.forEach(name => modal.classes.add(name)),
      remove: (...names) => names.forEach(name => modal.classes.delete(name))
    }
  };
  const elements = {
    rapatSelectBidang: selectBidang,
    rapatInputPimpinan: inputPimpinan,
    rapatSelectRuangan: selectRuangan,
    formJadwalRapat: form,
    modalJadwalRapat: modal
  };

  function FakeOption(text = '', value = text) {
    return { text: String(text), value: String(value) };
  }

  const context = vm.createContext({
    requireVisitAdmin_: () => {},
    Option: FakeOption,
    document: {
      getElementById: id => elements[id] || null
    },
    loadMeetingRoomOptions: async () => [{ id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50 }]
  });

  const moduleSource = fs.readFileSync(path.join(__dirname, '../../Admin/RapatPimpinan.html'), 'utf8');
  const scriptBody = moduleSource.match(/<script>([^]*?)<\/script>/)?.[1];
  assert.ok(scriptBody, 'Admin/RapatPimpinan.html should contain a <script> block');
  assert.ok(html.includes('const RAPAT_PIMPINAN_DIRECTORY ='), 'rendered Admin HTML should include RapatPimpinan');
  vm.runInContext(scriptBody, context);

  for (const fnName of ['bukaModalRapat', 'tutupModalRapat']) {
    const fnMatch = html.match(new RegExp('    function ' + fnName + '\\([^]*?\\n    \\}'));
    assert.ok(fnMatch, `${fnName} should exist in rendered Admin HTML`);
    vm.runInContext(fnMatch[0], context);
  }

  return { html, context, selectBidang, inputPimpinan, form, modal };
}

test('Rapat reference data matches all 13 rows, exact values, and exact 1..13 order', () => {
  const { context } = loadRapatPimpinanHarness();
  const actual = JSON.parse(vm.runInContext('JSON.stringify(RAPAT_PIMPINAN_DIRECTORY)', context));

  assert.equal(actual.length, 13);
  assert.deepEqual(actual, EXPECTED_RAPAT_PIMPINAN);
  assert.deepEqual(
    actual.map(row => row.no),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  );
});

test('Bidang Penyelenggara mapping resolves every record and preserves dropdown ordering', () => {
  const { context, selectBidang } = loadRapatPimpinanHarness();
  context.populateRapatBidangOptions();

  const renderedValues = selectBidang.options.map(opt => opt.value);
  assert.deepEqual(renderedValues, ['', ...EXPECTED_RAPAT_PIMPINAN.map(row => row.bidang)]);
  assert.deepEqual(
    selectBidang.options.map(opt => opt.text),
    ['-- Pilih Bidang Penyelenggara --', ...EXPECTED_RAPAT_PIMPINAN.map(row => row.bidang)]
  );

  for (const expected of EXPECTED_RAPAT_PIMPINAN) {
    const matched = JSON.parse(JSON.stringify(context.findRapatPimpinanByBidang(expected.bidang)));
    assert.deepEqual(matched, expected, expected.bidang);
  }

  assert.equal(context.findRapatPimpinanByBidang(''), null);
  assert.equal(context.findRapatPimpinanByBidang('Sekretariat / Umpeg'), null);
  assert.equal(context.findRapatPimpinanByBidang('Lainnya'), null);
});

test('selecting Bidang Penyelenggara auto-fills Pimpinan Rapat and updates on re-selection', () => {
  const { context, selectBidang, inputPimpinan } = loadRapatPimpinanHarness();
  context.populateRapatBidangOptions();

  for (const row of EXPECTED_RAPAT_PIMPINAN) {
    selectBidang.value = row.bidang;
    context.applyRapatBidangAutoFill();
    assert.equal(inputPimpinan.value, row.nama, `auto-fill for ${row.bidang}`);
  }

  selectBidang.value = '';
  context.applyRapatBidangAutoFill();
  assert.equal(inputPimpinan.value, '', 'clearing unselected bidang clears auto-filled value');
});

test('Pimpinan Rapat allows manual override, preserves custom input on clear, and resets on modal close', () => {
  const { context, selectBidang, inputPimpinan } = loadRapatPimpinanHarness();
  context.bukaModalRapat();

  selectBidang.value = 'Bidang Pemberdayaan dan Pelindungan Koperasi';
  context.applyRapatBidangAutoFill();
  assert.equal(inputPimpinan.value, 'Padlinsono, M.Si.');
  assert.equal(inputPimpinan.readOnly, false);
  assert.equal(inputPimpinan.disabled, false);

  inputPimpinan.value = 'Salim, S.Sos, M.Si (Plh.)';
  assert.equal(inputPimpinan.value, 'Salim, S.Sos, M.Si (Plh.)');

  selectBidang.value = '';
  context.applyRapatBidangAutoFill();
  assert.equal(inputPimpinan.value, 'Salim, S.Sos, M.Si (Plh.)');

  selectBidang.value = 'Subbagian Tata Usaha UPTD PLUT KUMKM';
  context.applyRapatBidangAutoFill();
  assert.equal(inputPimpinan.value, 'Hafidz Qodli Abdillah, S.E.');

  context.tutupModalRapat();
  assert.equal(selectBidang.value, '');
  assert.equal(inputPimpinan.value, '');
});

test('Jadwalkan Rapat modal preserves existing 8-field layout with no NIP or Pangkat/Golongan inputs', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const formHtml = html.match(/<form id="formJadwalRapat"[\s\S]*?<\/form>/)?.[0] || '';

  assert.ok(formHtml, 'formJadwalRapat must exist');
  const namedFields = [...formHtml.matchAll(/\bname="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(namedFields, [
    'judul',
    'ruangan',
    'tanggal',
    'jam_mulai',
    'jam_selesai',
    'bidang',
    'pimpinan',
    'agenda'
  ]);
  assert.doesNotMatch(formHtml, /\b(nip|pangkat|golongan)\b/i);
  assert.match(formHtml, /<select[^>]*name="bidang"[^>]*id="rapatSelectBidang"[^>]*onchange="applyRapatBidangAutoFill\(\)"/);
  assert.match(formHtml, /<input[^>]*type="text"[^>]*name="pimpinan"[^>]*id="rapatInputPimpinan"/);
  assert.doesNotMatch(formHtml, /<input[^>]*name="pimpinan"[^>]*(?:readonly|disabled)/i);
});

test('existing storage/schema accepts auto-filled and manually overridden values while preserving legacy records', async () => {
  const store = createFixtureStore(new Date('2026-11-05T05:00:00.000Z'), {
    seed: {
      meetings: [
        { id: 1, kode_rapat: 'RPT-20261103-001', judul_rapat: 'Rapat Legacy 1', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-03', jam_mulai: '09:00', jam_selesai: '10:30', penyelenggara_bidang: 'Usaha Mikro', pimpinan_rapat: 'Pimpinan Satu', jumlah_peserta: 5, agenda: 'Agenda 1', status: 'Terjadwal' },
        { id: 2, kode_rapat: 'RPT-20261102-001', judul_rapat: 'Rapat Legacy 2', ruangan_id: 6002, nama_ruangan: 'Ruangan Bidang Koperasi & UMKM', tanggal: '2026-11-02', jam_mulai: '13:00', jam_selesai: '14:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'Pimpinan Dua', jumlah_peserta: 4, agenda: 'Agenda 2', status: 'Selesai' }
      ]
    }
  });
  const legacyMeetings = store.responses.getRapatCalendar.data;
  assert.equal(legacyMeetings[0].penyelenggara_bidang, 'Usaha Mikro');
  assert.equal(legacyMeetings[1].penyelenggara_bidang, 'Sekretariat');
  assert.equal(legacyMeetings[1].pimpinan_rapat, 'Pimpinan Dua');

  const server = createLocalTestServer({ now: () => new Date('2026-11-05T05:00:00.000Z') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const rooms = (await (await fetch(`${baseUrl}/api/getMasterData`, { method: 'POST', body: '{}' })).json()).data.ruangan;
    const room = `${rooms[0].id}|${rooms[0].nama_ruangan}`;

    const autoFilled = await fetch(`${baseUrl}/api/simpanJadwalRapat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judul: 'Rapat Koordinasi Pengawasan',
        ruangan: room,
        tanggal: '2026-11-12',
        jam_mulai: '09:00',
        jam_selesai: '10:30',
        bidang: 'Bidang Pengawasan Koperasi',
        pimpinan: 'Eva Corrina, S.E.',
        agenda: 'Pembahasan tindak lanjut hasil pengawasan.'
      })
    });
    assert.equal((await autoFilled.json()).success, true);

    const overridden = await fetch(`${baseUrl}/api/simpanJadwalRapat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judul: 'Rapat Teknis PLUT',
        ruangan: room,
        tanggal: '2026-11-13',
        jam_mulai: '13:00',
        jam_selesai: '14:30',
        bidang: 'Subbagian Tata Usaha UPTD PLUT KUMKM',
        pimpinan: 'Meydiana Esterawaty Jastina, S.E.',
        agenda: 'Koordinasi operasional layanan PLUT.'
      })
    });
    assert.equal((await overridden.json()).success, true);

    const calendar = (await (await fetch(`${baseUrl}/api/getRapatCalendar`, { method: 'POST', body: '{}' })).json()).data;
    const savedAuto = calendar.find(m => m.judul_rapat === 'Rapat Koordinasi Pengawasan');
    const savedOverride = calendar.find(m => m.judul_rapat === 'Rapat Teknis PLUT');
    assert.equal(savedAuto.penyelenggara_bidang, 'Bidang Pengawasan Koperasi');
    assert.equal(savedAuto.pimpinan_rapat, 'Eva Corrina, S.E.');
    assert.equal(savedOverride.penyelenggara_bidang, 'Subbagian Tata Usaha UPTD PLUT KUMKM');
    assert.equal(savedOverride.pimpinan_rapat, 'Meydiana Esterawaty Jastina, S.E.');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('GAS simpanJadwalRapat and getRapatCalendar reuse existing 14-column schema and preserve legacy rows', () => {
  const rows = [
    [1, 'RPT-20261102-101', 'Rapat Lama', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '09:00', '10:00', 'Sekretariat / Umpeg', 'Pimpinan Lama', 5, 'Agenda lama', 'Selesai', '2026-11-02 08:00:00']
  ];
  const writes = [];
  const context = vm.createContext({
    requireVisitAdmin_: () => {},
    Date,
    Utilities: { formatDate: () => '2026-11-10 10:00:00' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  });
  for (const file of ['MeetingRooms.js', 'Code.js', 'AgendaDocuments.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  }
  const sheet = {
    getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
    getLastRow: () => rows.length + 1,
    getLastColumn: () => 14,
    getRange: () => ({
      getValues: () => rows.map(r => r.slice()),
      getDisplayValues: () => rows.map(r => r.slice()),
      setNumberFormat() {}
    }),
    appendRow: row => {
      rows.push(row);
      writes.push(row);
    }
  };
  context.getSpreadsheet = () => ({ getSheetByName: name => (name === 'Data_Rapat' ? sheet : null) });
  context.autoSortAllSheets = () => {};

  const res = context.simpanJadwalRapat({
    judul: 'Rapat Evaluasi Dana Bergulir',
    ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-14',
    jam_mulai: '10:00',
    jam_selesai: '11:30',
    bidang: 'Subbagian Tata Usaha UPTD Pengelolaan Dana Bergulir',
    pimpinan: 'Zulfahri, S.E., M.M.',
    agenda: 'Evaluasi penyaluran dana bergulir'
  });

  assert.equal(res.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 14);
  assert.equal(writes[0][8], 'Subbagian Tata Usaha UPTD Pengelolaan Dana Bergulir');
  assert.equal(writes[0][9], 'Zulfahri, S.E., M.M.');

  const calendar = context.getRapatCalendar().data;
  assert.equal(calendar.length, 2);
  assert.equal(calendar[0].penyelenggara_bidang, 'Subbagian Tata Usaha UPTD Pengelolaan Dana Bergulir');
  assert.equal(calendar[0].pimpinan_rapat, 'Zulfahri, S.E., M.M.');
  assert.equal(calendar[1].penyelenggara_bidang, 'Sekretariat / Umpeg');
  assert.equal(calendar[1].pimpinan_rapat, 'Pimpinan Lama');
});
