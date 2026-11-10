'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer } = require('../server');
const { createFixtureStore } = require('../fixtures');
const { completeTddPayload } = require('./tdd-test-data');

const root = path.resolve(__dirname, '../..');

test('TDD form matches TLD Ketua & Anggota Rombongan UI and submits pengikut_list', async () => {
  const tddHtml = fs.readFileSync(path.join(root, 'Tamu-FO/Index.html'), 'utf8');
  assert.match(tddHtml, /<label for="foNama"[^>]*>Nama Ketua Rombongan\s*<span[^>]*>\*<\/span><\/label>/);
  assert.match(tddHtml, /id="foNama"[^>]*name="ketua_nama"[^>]*required[^>]*placeholder="Nama lengkap ketua rombongan"/);
  assert.match(tddHtml, /<label for="foJumlah"[^>]*>Total Orang\s*<span[^>]*>\*<\/span><\/label>/);
  assert.match(tddHtml, /id="foJumlah"[^>]*name="jumlah_orang"[^>]*value="1"/);
  assert.match(tddHtml, /<label for="foAnggota"[^>]*>Daftar Anggota Rombongan\s*<span[^>]*>\*<\/span><\/label>/);
  assert.match(tddHtml, /<textarea[^>]*id="foAnggota"[^>]*name="pengikut_list"[^>]*required[^>]*rows="2"[^>]*placeholder="Satu nama anggota per baris \(jika sendiri, tulis nama Anda\)\.\.\."/);
  assert.doesNotMatch(tddHtml, /Nama Pengunjung|Masukkan nama lengkap Anda/);

  // Verify public Tdd.html stays synced with Tamu-FO/Index.html.
  const publicTddHtml = fs.readFileSync(path.join(root, 'Public/Tdd.html'), 'utf8');
  assert.equal(publicTddHtml, tddHtml.replace(/include\('(AttendancePolicy|MobileBase)'\)/g, "include_('$1')"));

  // Exercise real submitFo browser script against a stubbed fetch endpoint.
  const script = tddHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(script, 'TDD form script exists');
  const submitted = [];
  const formValues = new Map([
    ['ketua_nama', 'Ketua Uji FO'],
    ['pengikut_list', 'Ketua Uji FO\nAnggota Dua'],
    ['jumlah_orang', '2'],
    ['instansi', 'UMKM Uji'],
    ['narahubung_hp', '080000000999'],
    ['alamat', 'Batam Centre'],
    ['keperluan', 'Konsultasi koperasi']
  ]);
  const elements = {
    foBidangOptions: {
      children: [],
      append(...nodes) { this.children.push(...nodes); },
      querySelectorAll() { return [{ checked: true, setCustomValidity() {} }]; },
      addEventListener() {}
    },
    formTamuFo: { reportValidity: () => true },
    btnSubmitFo: { disabled: false, innerHTML: '' },
    foResKode: { innerText: '' },
    foResBidang: { innerText: '' },
    foResLo: { innerText: '' },
    modalSuksesFo: { classList: { remove() {}, add() {} } }
  };
  const context = vm.createContext({
    window: {},
    document: {
      getElementById: id => elements[id] || {},
      createElement: () => ({
        className: '', type: '', name: '', value: '', textContent: '',
        append(...nodes) { this.children = nodes; }
      })
    },
    FormData: class {
      get(key) { return formValues.get(key) ?? ''; }
      getAll(key) { return key === 'tujuan_bidang' ? ['Bidang Pengawasan Koperasi'] : []; }
    },
    fetch: async (url, opts) => {
      submitted.push({ url, body: JSON.parse(opts.body) });
      return { json: async () => ({ success: true, data: { kode_kunjungan: 'TDD-10112026-001', tujuan_bidang: 'Bidang Pengawasan Koperasi', lo_nama: 'Mery Sefina Simor, S.Kom.' } }) };
    },
    alert(msg) { throw new Error('Unexpected alert: ' + msg); }
  });
  vm.runInContext(script.replace('<?!= JSON.stringify(tddDestinations) ?>', JSON.stringify([{ bidang: 'Bidang Pengawasan Koperasi', pic: 'Mery Sefina Simor, S.Kom.' }])), context);
  await context.submitFo({ preventDefault() {} });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].url, '/api/registerTamuFo');
  assert.equal(submitted[0].body.ketua_nama, 'Ketua Uji FO');
  assert.equal(submitted[0].body.pengikut_list, 'Ketua Uji FO\nAnggota Dua');
  assert.equal(submitted[0].body.jumlah_orang, '2');
});

test('local TDD rejects empty/whitespace pengikut_list and preserves TDD-specific behavior on valid submit', async () => {
  const server = createLocalTestServer({ now: new Date('2026-11-10T03:00:00Z') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (name, data) => (await fetch(base + '/api/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  })).json();
  try {
    const emptyMembers = await post('registerTamuFo', completeTddPayload({ pengikut_list: '   ' }));
    assert.equal(emptyMembers.success, false);
    assert.match(emptyMembers.error, /anggota rombongan.*wajib/i);

    const emptyKetua = await post('registerTamuFo', completeTddPayload({ ketua_nama: '   ' }));
    assert.equal(emptyKetua.success, false);
    assert.match(emptyKetua.error, /ketua rombongan.*wajib/i);

    const ok = await post('registerTamuFo', completeTddPayload({
      ketua_nama: 'Rina Marlina',
      pengikut_list: 'Rina Marlina\nBudi Santoso',
      jumlah_orang: 2,
      instansi: '',
      alamat: ''
    }));
    assert.equal(ok.success, true);

    const list = await post('getTamuList', {});
    const saved = list.data[0];
    assert.equal(saved.tipe_tamu, 'dalam_daerah_fo');
    assert.equal(saved.instansi, 'Perorangan');
    assert.equal(saved.ketua_nama, 'Rina Marlina');
    assert.equal(saved.pengikut_list, 'Rina Marlina\nBudi Santoso');
    assert.equal(saved.bawa_sppd, false);
    assert.equal(saved.status_kunjungan, 'Non-SPPD');
    assert.equal(saved.jam_kunjungan, '10:00');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('Admin dashboard, modal, search and backward compatibility handle TDD Ketua & Anggota Rombongan', async () => {
  // 1. GAS getDashboardData maps pengikut_list alongside ketua_nama in recentTamu
  const gasContext = vm.createContext({ Utilities: { formatDate: () => '2026-11-10' } });
  vm.runInContext(fs.readFileSync(path.join(root, 'Admin/Code.js'), 'utf8'), gasContext);
  const tddRow = [
    12, 'TDD-10112026-001', 'dalam_daerah_fo', 'Perorangan', '', 2,
    'Ketua TDD', 'Ketua TDD\nAnggota TDD', 'Bidang Pengawasan Koperasi', 'Konsultasi',
    'Ketua TDD', '080000000123', '2026-11-10', '10:00', '', '',
    'pengawasan-koperasi', 'Mery Sefina Simor, S.Kom.', 0, 'Diterima', '2026-11-10 10:00:00'
  ];
  const legacyTddRow = tddRow.slice();
  legacyTddRow[0] = 11;
  legacyTddRow[1] = 'TDD-09112026-001';
  legacyTddRow[7] = '';
  gasContext.getSpreadsheet = () => ({
    getSheetByName: name => name === 'Data_Tamu'
      ? { getLastRow: () => 3, getLastColumn: () => 21, getRange: () => ({ getValues: () => [tddRow, legacyTddRow] }) }
      : null
  });
  const dashboard = gasContext.getDashboardData();
  assert.equal(dashboard.data.recentTamu[0].ketua_nama, 'Ketua TDD');
  assert.equal(dashboard.data.recentTamu[0].pengikut_list, 'Ketua TDD\nAnggota TDD');
  assert.equal(dashboard.data.recentTamu[1].pengikut_list, '');

  // 2. Admin VisitModal renders TDD Ketua & Anggota Rombongan in read-only mode, escaping HTML, and shows '-' for legacy empty values
  const modalHtml = fs.readFileSync(path.join(root, 'Admin/VisitModal.html'), 'utf8');
  const fields = {};
  const modalContext = vm.createContext({
    document: {
      addEventListener() {},
      body: { style: {} },
      getElementById: id => id === 'visitDisposisi' ? null : (fields[id] ||= {}),
      querySelector: () => ({ focus() {} })
    },
    escapeHtml: v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    formatMeetingDate: v => v,
    showToast() {},
    callBackend: (fn, args, success) => {
      const code = args[0].kode_kunjungan;
      const visit = code === 'TDD-LEGACY'
        ? { kode_kunjungan: 'TDD-LEGACY', tipe_tamu: 'dalam_daerah_fo', instansi: 'Perorangan', alamat: '', ketua_nama: 'Tamu Lama', jumlah_orang: 1, pengikut_list: '', tujuan_bidang: 'Bidang Pengawasan Koperasi', lo_nama: 'Mery Sefina Simor, S.Kom.', keperluan: 'Konsultasi', narahubung_hp: '080000000111', tanggal_kunjungan: '2026-11-09', jam_kunjungan: '09:00' }
        : { kode_kunjungan: 'TDD-NEW', tipe_tamu: 'dalam_daerah_fo', instansi: 'Koperasi Uji', alamat: '', ketua_nama: 'Ketua <Baru>', jumlah_orang: 2, pengikut_list: 'Ketua <Baru>\nAnggota Dua', tujuan_bidang: 'Bidang Pengawasan Koperasi', lo_nama: 'Mery Sefina Simor, S.Kom.', keperluan: 'Konsultasi', narahubung_hp: '080000000222', tanggal_kunjungan: '2026-11-10', jam_kunjungan: '10:00' };
      success({ success: true, data: { visit, workflow: { status: 'Non-SPPD' }, stage: 0 } });
    }
  });
  vm.runInContext(modalHtml.match(/<script>([\s\S]*?)<\/script>/)[1], modalContext);

  await modalContext.openVisitWorkflow('TDD-NEW', { readOnly: true });
  assert.equal(fields.visitModalTitle.textContent, 'Kunjungan Tamu Dalam Daerah');
  assert.match(fields.visitModalContent.innerHTML, /<dt>Ketua Rombongan<\/dt><dd>Ketua &lt;Baru&gt;<\/dd>/);
  assert.match(fields.visitModalContent.innerHTML, /<dt>Daftar Anggota Rombongan<\/dt><dd>Ketua &lt;Baru&gt;\nAnggota Dua<\/dd>/);

  await modalContext.openVisitWorkflow('TDD-LEGACY', { readOnly: true });
  assert.match(fields.visitModalContent.innerHTML, /<dt>Ketua Rombongan<\/dt><dd>Tamu Lama<\/dd>/);
  assert.match(fields.visitModalContent.innerHTML, /<dt>Daftar Anggota Rombongan<\/dt><dd>-<\/dd>/);

  // Snapshot before RPC returns also formats new and legacy TDD rows cleanly
  const newSnap = modalContext.renderVisitSnapshot({ ketua_nama: 'Ketua Snap', jumlah_orang: 2, pengikut_list: 'Ketua Snap\nAnggota Snap', tanggal_kunjungan: '2026-11-10', jam_kunjungan: '10:00' }, true);
  assert.match(newSnap, /<dt>Ketua Rombongan<\/dt><dd>Ketua Snap<\/dd>/);
  assert.match(newSnap, /<dt>Daftar Anggota Rombongan<\/dt><dd>Ketua Snap\nAnggota Snap<\/dd>/);
  const legacySnap = modalContext.renderVisitSnapshot({ ketua_nama: 'Tamu Lama', jumlah_orang: 1, pengikut_list: '', tanggal_kunjungan: '2026-11-09', jam_kunjungan: '09:00' }, false);
  assert.match(legacySnap, /<dt>Daftar Anggota Rombongan<\/dt><dd>-<\/dd>/);

  // 3. Local store search & Buku Tamu table display handle both new TDD (with members) and old TDD (without members)
  const store = createFixtureStore(new Date('2026-11-10T03:00:00Z'));
  const submitted = store.handleMutation('registerTamuFo', completeTddPayload({
    ketua_nama: 'Ketua Rombongan TDD',
    pengikut_list: 'Ketua Rombongan TDD\nAnggota Khusus Cari',
    jumlah_orang: 2
  }));
  assert.equal(submitted.success, true);
  const visitors = store.responses.getTamuList.data;
  const search = require('../agenda-search').filter;
  const matched = search(visitors, 'Anggota Khusus Cari', '');
  assert.equal(matched.length, 1);
  assert.equal(matched[0].kode_kunjungan, submitted.data.kode_kunjungan);

  const adminHtml = fs.readFileSync(path.join(root, 'Admin/Index.html'), 'utf8');
  const rowContext = vm.createContext({ escapeHtml: v => String(v ?? ''), formatVisitDateCompact: v => v });
  for (const name of ['renderBidangBadges', 'getVisitStatus', 'renderVisitStatus', 'renderVisitRow']) {
    const match = adminHtml.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'));
    assert.ok(match, name + ' exists');
    vm.runInContext(match[0], rowContext);
  }
  const bukuTamuRow = rowContext.renderVisitRow(matched[0], false);
  assert.match(bukuTamuRow, /Ketua Rombongan TDD/);
  assert.match(bukuTamuRow, /\(2 Orang\)/);
  assert.match(bukuTamuRow, /Non-SPPD/);
  assert.match(bukuTamuRow, /<button type="button" disabled[^>]*>[^]*EDIT/);
});

test('solo visitor (Total Orang = 1), group member counts, and TLD validation parity match', () => {
  const store = createFixtureStore(new Date('2026-11-10T03:00:00Z'));

  // Solo visitor: Total Orang = 1 with own name in both fields
  const solo = store.handleMutation('registerTamuFo', completeTddPayload({
    ketua_nama: 'Sari Dewi',
    pengikut_list: 'Sari Dewi',
    jumlah_orang: 1
  }));
  assert.equal(solo.success, true);
  let latest = store.responses.getTamuList.data[0];
  assert.equal(latest.jumlah_orang, 1);
  assert.equal(latest.ketua_nama, 'Sari Dewi');
  assert.equal(latest.pengikut_list, 'Sari Dewi');

  // Group visitor: count may cover ketua + other members (2 lines for 3 people, matching TLD)
  const group = store.handleMutation('registerTamuFo', completeTddPayload({
    ketua_nama: 'Budi Santoso',
    pengikut_list: 'Citra Lestari\nDodi Pratama',
    jumlah_orang: 3
  }));
  assert.equal(group.success, true);
  latest = store.responses.getTamuList.data[0];
  assert.equal(latest.jumlah_orang, 3);
  assert.equal(latest.ketua_nama, 'Budi Santoso');
  assert.equal(latest.pengikut_list, 'Citra Lestari\nDodi Pratama');

  // Invalid counts & missing required fields match TLD behavior
  for (const badCount of [0, -1, '1.5', '   ', 'abc']) {
    const res = store.handleMutation('registerTamuFo', completeTddPayload({ jumlah_orang: badCount }));
    assert.equal(res.success, false);
    assert.match(res.error, /bilangan bulat minimal 1/i);
  }
  const tld = require('../tld-directory');
  const tdd = require('../tdd-directory');
  const { completeTldPayload } = require('./tld-test-data');
  for (const field of ['ketua_nama', 'pengikut_list']) {
    let tldMsg = '', tddMsg = '';
    try { tld.prepareVisit(completeTldPayload({ [field]: '   ' })); } catch (e) { tldMsg = e.message; }
    try { tdd.prepareVisit(completeTddPayload({ [field]: '   ' })); } catch (e) { tddMsg = e.message; }
    assert.equal(tddMsg, tldMsg, field + ' error matches TLD');
  }
});
