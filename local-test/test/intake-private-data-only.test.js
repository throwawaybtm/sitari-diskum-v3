'use strict';
// Incident 2026-11-25: every TLD registration failed on the live Public form ("TLD_MAX_UPLOAD_BYTES is
// not defined", then "normalizeTldUploads_ is not defined") because intake logic lived in the private,
// gitignored Destinations.js and the owner's copy predated the tracked code that used it.
// Intake logic is now tracked (Tamu-Luar/IntakeRules.js, Tamu-FO/IntakeRules.js); private files hold
// only the destination arrays. These tests build the real bundle from data-only private files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildPublic } = require('../../maintenance/build-public');
const { inspectDestinationsSource, findPrivateDestinationProblems, assertDataOnlyDestinations } = require('../../maintenance/private-destinations');
const { destinations } = require('./synthetic-fixtures');
const { completeTldPayload } = require('./tld-test-data');
const { completeTddPayload } = require('./tdd-test-data');

const ROOT = path.resolve(__dirname, '../..');
const dataOnly = symbol => `/** synthetic */\nconst ${symbol} = ${JSON.stringify(destinations, null, 2)};\n`;
const INCIDENT_NAMES = [
  'TLD_MAX_UPLOAD_BYTES', 'TLD_MAX_UPLOAD_FILES', 'getTldPublicDestinations_', 'validateTldUpload_',
  'normalizeTldUploads_', 'validateTldRequiredFields_', 'prepareTldVisit_', 'getTddPublicDestinations_', 'prepareTddVisit_'
];

/** A throwaway source root: tracked files the build reads, plus data-only (or given) private files. */
function sourceRoot({ tld = dataOnly('TLD_DESTINATIONS'), tdd = dataOnly('TDD_DESTINATIONS') } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitari-intake-'));
  const copy = rel => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel)); };
  ['Admin/.clasp.json', 'Public/.clasp.json', 'maintenance/templates/PublicCode.js',
    'Tamu-Luar/Code.js', 'Tamu-Luar/IntakeRules.js', 'Tamu-Luar/Index.html', 'Tamu-Luar/OrganizationStructure.html',
    'Tamu-FO/Code.js', 'Tamu-FO/IntakeRules.js', 'Tamu-FO/Index.html',
    'Admin/Presensi.html', 'Admin/AttendancePolicy.html', 'Admin/MobileBase.html', 'Admin/TailwindCompiled.html'].forEach(copy);
  fs.writeFileSync(path.join(dir, 'Tamu-Luar/Destinations.js'), tld);
  fs.writeFileSync(path.join(dir, 'Tamu-FO/Destinations.js'), tdd);
  return dir;
}
function build(dir) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sitari-public-'));
  buildPublic({ coreVersion: 59, sourceRoot: dir, targetDir: out, intakeFile: path.join(out, 'PublicIntake.js') });
  return fs.readFileSync(path.join(out, 'PublicIntake.js'), 'utf8');
}

/** Minimal GAS stand-ins: one shared lock, two sheets, Drive saving to a fake folder. */
function gasContext() {
  const rows = { Data_Tamu: [], Kendali_SPPD: [] };
  let held = false;
  const sheet = name => ({
    getLastRow: () => rows[name].length + 1,
    getLastColumn: () => (name === 'Data_Tamu' ? 21 : 17),
    appendRow: row => { assert.equal(held, true, 'writes hold the script lock'); rows[name].push(Array.from(row)); },
    getRange: (row, column, height = 1, width = 1) => ({
      setNumberFormat() { return this; }, setValue() { return this; }, sort() {},
      getValues: () => Array.from({ length: height }, (_, o) => Array.from({ length: width }, (_, c) => rows[name][row - 2 + o]?.[column - 1 + c])),
      getDisplayValues() { return this.getValues().map(r => r.map(v => String(v ?? ''))); }
    })
  });
  const spreadsheet = { getSheetByName: name => (rows[name] ? sheet(name) : null) };
  const context = vm.createContext({
    Date, rows,
    LockService: { getScriptLock: () => ({ waitLock() { held = true; }, releaseLock() { held = false; } }) },
    SpreadsheetApp: { flush() {} },
    getSpreadsheet: () => spreadsheet,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => (key === 'FOLDER_SURAT_ID' ? 'synthetic-folder' : null) }) },
    Utilities: {
      formatDate: (_d, _z, f) => ({ 'yyyy-MM-dd': '2026-11-25', 'HH:mm': '09:15', 'yyyy-MM-dd HH:mm:ss': '2026-11-25 09:15:00' }[f]),
      base64Decode: v => Buffer.from(v, 'base64'), newBlob: (_b, _t, name) => ({ name })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' },
      getFolderById: () => ({ createFile: () => ({ setSharing() {}, getUrl: () => 'https://example.invalid/doc' }) })
    }
  });
  return context;
}

test('bundle built from data-only private files defines every intake identifier the tracked code uses', () => {
  const dir = sourceRoot();
  const source = build(dir);
  assert.doesNotThrow(() => new vm.Script(source), 'bundle parses (no duplicate declarations)');
  const probe = source.replace('\nreturn {registerTamuLuar:', '\nreturn {__typeOf:function(name){try{return typeof eval(name);}catch(e){return "missing";}},registerTamuLuar:');
  assert.notEqual(probe, source, 'probe hook inserted');
  const context = gasContext();
  vm.runInContext(probe, context);
  const intake = context.SI_TARI_INTAKE_;

  // Every top-level name declared in the tracked intake sources, plus the private data arrays.
  const declared = new Set(['TLD_DESTINATIONS', 'TDD_DESTINATIONS', ...INCIDENT_NAMES]);
  for (const rel of ['Tamu-Luar/IntakeRules.js', 'Tamu-FO/IntakeRules.js', 'Tamu-Luar/Code.js']) {
    for (const m of fs.readFileSync(path.join(dir, rel), 'utf8').matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
  }
  declared.delete('doGet');
  // Every private helper (name_) the tracked intake code calls must resolve inside the bundle.
  const called = new Set();
  const trackedCode = ['Tamu-Luar/IntakeRules.js', 'Tamu-FO/IntakeRules.js', 'Tamu-Luar/Code.js'].map(rel => fs.readFileSync(path.join(dir, rel), 'utf8')).join('\n')
    + fs.readFileSync(path.join(dir, 'Tamu-FO/Code.js'), 'utf8').match(/^function registerTamuFo\([^]*?^\}/m)[0];
  for (const m of trackedCode.matchAll(/\b([A-Za-z_$][\w$]*_)\s*\(/g)) called.add(m[1]);
  const missing = [...declared, ...called].filter(name => !['function', 'object', 'number', 'string'].includes(intake.__typeOf(name)));
  assert.deepEqual(missing, [], 'undefined inside the intake bundle');
  for (const name of INCIDENT_NAMES) assert.notEqual(intake.__typeOf(name), 'undefined', name);
});

test('registerTamuLuar and registerTamuFo succeed through the bundle built from data-only private files', () => {
  const context = gasContext();
  vm.runInContext(build(sourceRoot()), context);
  const tld = context.SI_TARI_INTAKE_.registerTamuLuar(completeTldPayload({
    instansi: 'Instansi Sintetis', alamat: 'Alamat Sintetis', ketua_nama: 'Ketua Sintetis', pengikut_list: 'Ketua Sintetis',
    keperluan: 'Agenda sintetis', narahubung_hp: '080000000001', tanggal_kunjungan: '2026-12-01', tujuan_bidang: [destinations[0].bidang]
  }));
  assert.equal(tld.success, true, tld.error);
  const tdd = context.SI_TARI_INTAKE_.registerTamuFo(completeTddPayload({
    ketua_nama: 'Pengunjung Sintetis', pengikut_list: 'Pengunjung Sintetis', narahubung_hp: '080000000002',
    keperluan: 'Agenda sintetis', tujuan_bidang: [destinations[1].bidang]
  }));
  assert.equal(tdd.success, true, tdd.error);
  assert.equal(context.rows.Data_Tamu.length, 2);
  const directory = JSON.parse(JSON.stringify(context.SI_TARI_INTAKE_.directory('tld')));
  assert.equal(directory.length, destinations.length);
  assert.ok(directory.every(item => Object.keys(item).sort().join(',') === 'bidang,pic'), 'public directory never carries phones or IDs');
});

test('the build refuses a stale private file that still defines intake logic, and writes nothing', () => {
  const stale = dataOnly('TLD_DESTINATIONS') + '\nconst TLD_MAX_UPLOAD_BYTES = 1;\nfunction validateTldUpload_(value) { return value; }\n';
  const dir = sourceRoot({ tld: stale });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sitari-public-'));
  assert.throws(
    () => buildPublic({ coreVersion: 59, sourceRoot: dir, targetDir: out, intakeFile: path.join(out, 'PublicIntake.js') }),
    error => /Tamu-Luar\/Destinations\.js defines TLD_MAX_UPLOAD_BYTES, validateTldUpload_ besides TLD_DESTINATIONS/.test(error.message)
      && /Trim each file/.test(error.message)
      && !error.message.includes('synthetic')
  );
  assert.deepEqual(fs.readdirSync(out), [], 'nothing written');
});

test('private-file inspection names only top-level extras and is not fooled by strings or comments', () => {
  const clean = "/* const fake = 1; function nope() {} */\nconst TDD_DESTINATIONS = [\n  { id: 'a', bidang: 'B', pic: 'function x() {} // const y', phone: '62' }\n];\n";
  assert.deepEqual(inspectDestinationsSource(clean, 'TDD_DESTINATIONS'), { hasData: true, extras: [], otherCode: false });
  const stale = clean + 'function prepareTddVisit_(p) { const fields = {}; return fields; }\n';
  assert.deepEqual(inspectDestinationsSource(stale, 'TDD_DESTINATIONS').extras, ['prepareTddVisit_']);
  assert.equal(inspectDestinationsSource("const TDD_DESTINATIONS = [];\nconsole.log('x');\n", 'TDD_DESTINATIONS').otherCode, true);
  assert.equal(inspectDestinationsSource('const OTHER = [];', 'TDD_DESTINATIONS').hasData, false);
});

test('tracked config templates are data-only and pass the same check the build uses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitari-templates-'));
  for (const rel of ['Tamu-Luar/Destinations.js', 'Tamu-FO/Destinations.js']) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'config-templates', rel + '.example'), path.join(dir, rel));
  }
  assert.deepEqual(findPrivateDestinationProblems(dir), []);
  assert.doesNotThrow(() => assertDataOnlyDestinations(dir));
});
