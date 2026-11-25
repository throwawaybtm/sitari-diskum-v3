'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { completeTldPayload, testDocument } = require('./tld-test-data');

const ROOT = path.resolve(__dirname, '../..');
const SOURCES = {
  luar: ['Tamu-Luar/Destinations.js', 'Tamu-Luar/IntakeRules.js', 'Tamu-Luar/Code.js'],
  bundle: ['config-templates/Admin/PublicIntake.js.example']
};

function load(kind) {
  const saved = [];
  const sheets = {};
  const sheetFor = name => sheets[name] || (sheets[name] = {
    rows: [],
    getLastRow() { return this.rows.length + 1; },
    getLastColumn: () => 21,
    getRange: () => ({ setNumberFormat() { return this; }, setValue() { return this; }, getValues: () => [], sort() {} }),
    appendRow(row) { this.rows.push(Array.from(row)); }
  });
  const spreadsheet = { getSheetByName: sheetFor };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    getSpreadsheet: () => spreadsheet,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'synthetic-folder', setProperty() {} }) },
    Utilities: {
      formatDate: (_d, _z, format) => ({ 'yyyy-MM-dd': '2026-11-16', 'HH:mm': '10:00', 'yyyy-MM-dd HH:mm:ss': '2026-11-16 10:00:00' }[format]),
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: (_bytes, _type, name) => ({ name })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' },
      getFolderById: () => ({
        createFile: blob => {
          saved.push(blob.name);
          return { setSharing() {}, setTrashed() {}, getUrl: () => 'https://drive.google.com/file/d/' + blob.name + '/view' };
        }
      })
    }
  });
  for (const file of SOURCES[kind]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
  const api = kind === 'bundle' ? context.SI_TARI_INTAKE_ : context;
  if (kind !== 'bundle') {
    context.getSharedSpreadsheet_ = () => spreadsheet;
    context.sortTamu_ = () => {};
    context.sortSppd_ = () => {};
  }
  return { context: api, saved, tamu: () => sheetFor('Data_Tamu').rows };
}

for (const kind of Object.keys(SOURCES)) {
  test(`${kind}: several documents per field are all saved and stored as a JSON array`, () => {
    const { context, saved, tamu } = load(kind);
    const result = context.registerTamuLuar(completeTldPayload({
      surat_kunjungan_base64: [testDocument, testDocument],
      surat_tugas_base64: [testDocument, testDocument, testDocument]
    }));
    assert.equal(result.success, true, result.error);
    assert.equal(saved.length, 5);
    const [row] = tamu();
    assert.deepEqual(JSON.parse(row[14]).length, 2);
    assert.deepEqual(JSON.parse(row[15]).length, 3);
    assert.match(row[14], /Surat_Kunjungan_TLD-[^"]+_1/);
    assert.match(row[15], /Surat_Tugas_TLD-[^"]+_3/);
  });

  test(`${kind}: one document (string or one-item array) keeps the legacy plain-URL cell`, () => {
    for (const value of [testDocument, [testDocument]]) {
      const { context, tamu } = load(kind);
      context.registerTamuLuar(completeTldPayload({ surat_kunjungan_base64: value, surat_tugas_base64: value }));
      const [row] = tamu();
      assert.match(row[14], /^https:\/\/drive\.google\.com\/file\/d\/Surat_Kunjungan_[^/]+\/view$/);
      assert.doesNotMatch(row[14], /^\[/);
    }
  });

  test(`${kind}: more than 5 files, an oversized file or a bad type is rejected before anything is saved`, () => {
    const big = 'data:application/pdf;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    const cases = [
      [{ surat_tugas_base64: Array(6).fill(testDocument) }, /Maksimal 5 dokumen/],
      [{ surat_kunjungan_base64: [testDocument, big] }, /5 MB/],
      [{ surat_tugas_base64: [testDocument, 'data:text/html;base64,PGI+'] }, /PDF atau foto/],
      [{ surat_kunjungan_base64: [] }, /wajib diisi|minimal satu/],
      [{ surat_tugas_base64: [testDocument, 42] }, /tidak valid/]
    ];
    for (const [override, message] of cases) {
      const { context, saved, tamu } = load(kind);
      assert.throws(() => context.registerTamuLuar(completeTldPayload(override)), message);
      assert.equal(saved.length, 0, 'no Drive file is created for a rejected batch');
      assert.equal(tamu().length, 0);
    }
  });
}

test('TLD form sends every selected file of each field as an array', () => {
  const html = fs.readFileSync(path.join(ROOT, 'Tamu-Luar/Index.html'), 'utf8');
  assert.match(html, /selectedDocuments\.fileSuratKunjungan\.map\(fileToBase64\)/);
  assert.match(html, /selectedDocuments\.fileSuratTugas\.map\(fileToBase64\)/);
  assert.match(html, /const maxUploadFiles = 5;/);
});
