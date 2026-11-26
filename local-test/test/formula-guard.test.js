'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const FILES = ['Admin/Code.js', 'Tamu-FO/Code.js', 'Tamu-Luar/Code.js'];
const helperText = (source, name) => {
  const match = source.match(new RegExp('function ' + name + '\\(value\\) \\{[^]*?\\n\\}'));
  assert.ok(match, name + ' missing');
  return match[0];
};

function helpers(file) {
  const source = read(file);
  const context = vm.createContext({});
  vm.runInContext(helperText(source, 'guardSheetText_') + '\n' + helperText(source, 'guardSheetPhone_'), context);
  return context;
}

test('formula guard helper copies stay identical', () => {
  for (const name of ['guardSheetText_', 'guardSheetPhone_']) {
    const [first, ...rest] = FILES.map(file => helperText(read(file), name));
    rest.forEach(copy => assert.equal(copy, first, name));
  }
});

test('guardSheetText_ prefixes formula starters only', () => {
  const { guardSheetText_: guard } = helpers('Admin/Code.js');
  for (const bad of ['=HYPERLINK("http://x","y")', '+1+1', '-2', '@SUM(A1)', ' =A1', '\t+1', '\r\n@x'])
    assert.equal(guard(bad), "'" + bad, JSON.stringify(bad));
  for (const ok of ['Budi Santoso', 'Anna-Maria', 'PT Maju-Jaya', 'a=b', '', "'quoted", 'Jl. Merdeka No. 1'])
    assert.equal(guard(ok), ok, JSON.stringify(ok));
  assert.equal(guard(5), 5);
  assert.equal(guard(null), null);
  const date = new Date(0);
  assert.equal(guard(date), date);
});

test('guardSheetPhone_ keeps real phone numbers and guards the rest', () => {
  const { guardSheetPhone_: guard } = helpers('Admin/Code.js');
  assert.equal(guard(' 0812-3456 7890 '), '0812-3456 7890');
  assert.equal(guard('+6281234567890'), '+6281234567890');
  assert.equal(guard(undefined), '');
  assert.equal(guard('-'), '-');
  assert.equal(guard('=1+1'), "'=1+1");
  assert.equal(guard('+1+1'), "'+1+1");
  assert.equal(guard('@SUM(A1)'), "'@SUM(A1)");
});

function registerContext(file, fn) {
  const rows = [];
  const phoneWrites = [];
  const sheet = {
    getLastRow: () => 1 + rows.length,
    getRange: () => ({ setNumberFormat() { return this; }, setValue(v) { phoneWrites.push(v); return this; }, getValues: () => [] }),
    appendRow: row => rows.push(row)
  };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-11-11' }
  });
  vm.runInContext(read(file), context);
  Object.assign(context, {
    getSharedSpreadsheet_: () => ({ getSheetByName: () => sheet }),
    prepareTddVisit_: () => ({ bidang: 'Koperasi', picIds: '1', pic: 'PIC' }),
    prepareTldVisit_: () => ({ bidang: 'Koperasi', picIds: '1', pic: 'PIC' }),
    validateTldRequiredFields_: () => {},
    saveTldDocuments_: () => 'https://example.invalid/doc',
    generateVisitCode_: () => 'TLD-11112026-001',
    sortTamu_: () => {}, sortSppd_: () => {}
  });
  return { context, rows, phoneWrites, run: payload => context[fn](payload) };
}

const hostile = {
  instansi: '=HYPERLINK("http://x","y")', alamat: '+1+1', ketua_nama: '@SUM(A1)', pengikut_list: '-2',
  keperluan: '=1+1', narahubung_nama: '-cmd', narahubung_hp: '=1+1', jumlah_orang: 3, tanggal_kunjungan: '2026-11-12'
};

test('registerTamuFo guards free text, keeps numbers and generated values', () => {
  const env = registerContext('Tamu-FO/Code.js', 'registerTamuFo');
  assert.equal(env.run(hostile).success, true);
  const row = env.rows[0];
  assert.equal(row[3], "'=HYPERLINK(\"http://x\",\"y\")");
  assert.equal(row[4], "'+1+1");
  assert.equal(row[5], 3);
  assert.equal(row[6], "'@SUM(A1)");
  assert.equal(row[7], "'-2");
  assert.equal(row[9], "'=1+1");
  assert.equal(row[11], "'=1+1");
  assert.equal(row[12], '2026-11-11');
  assert.equal(env.phoneWrites[0], "'=1+1");
  assert.equal(row.length, 21);
});

test('registerTamuFo leaves normal names untouched', () => {
  const env = registerContext('Tamu-FO/Code.js', 'registerTamuFo');
  env.run({ instansi: 'PT Maju-Jaya', ketua_nama: 'Anna-Maria', keperluan: 'Konsultasi', narahubung_hp: '081234', jumlah_orang: 1 });
  assert.equal(env.rows[0][3], 'PT Maju-Jaya');
  assert.equal(env.rows[0][6], 'Anna-Maria');
  assert.equal(env.rows[0][11], '081234');
  assert.equal(env.phoneWrites[0], '081234');
});

test('registerTamuLuar guards Data_Tamu and Kendali_SPPD text', () => {
  const env = registerContext('Tamu-Luar/Code.js', 'registerTamuLuar');
  assert.equal(env.run(hostile).success, true);
  const [tamu, sppd] = env.rows;
  assert.equal(tamu[3], "'=HYPERLINK(\"http://x\",\"y\")");
  assert.equal(tamu[4], "'+1+1");
  assert.equal(tamu[5], 3);
  assert.equal(tamu[6], "'@SUM(A1)");
  assert.equal(tamu[7], "'-2");
  assert.equal(tamu[9], "'=1+1");
  assert.equal(tamu[10], "'-cmd");
  assert.equal(tamu[11], "'=1+1");
  assert.equal(tamu[14], 'https://example.invalid/doc');
  assert.equal(sppd[3], "'=HYPERLINK(\"http://x\",\"y\")");
  assert.equal(sppd[4], "'@SUM(A1)");
  assert.equal(sppd[2], 'TLD-11112026-001');
});

test('public attendance appendRow passes anonymous text through the guard', () => {
  const source = read('Admin/Code.js');
  const call = source.match(/sheet\.appendRow\(\[\s*nextId, p\.rapat_id[^]*?\]\);/);
  assert.ok(call);
  for (const field of ['p.nama', 'p.nip', 'p.jabatan', 'p.nama_opd'])
    assert.match(call[0], new RegExp('guardSheetText_\\(' + field.replace('.', '\\.')));
  assert.match(call[0], /guardSheetPhone_\(p\.no_hp/);
  assert.match(source, /phoneCell\.setValue\(guardSheetPhone_\(p\.no_hp/);
});
