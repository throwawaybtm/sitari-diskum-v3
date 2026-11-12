'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { completeTldPayload } = require('./tld-test-data');
const pdf = 'data:application/pdf;base64,JVBERg==';
const image = 'data:image/png;base64,aW1hZ2U=';

function load(bundle = false, failAt = 0, existingIds = []) {
  const files = [];
  const rows = [];
  const events = [];
  const c = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'synthetic-folder' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    Utilities: {
      formatDate: (_d, _tz, format) => format === 'yyyy-MM-dd' ? '2026-11-12' : '10:00',
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: (_bytes, mime, name) => ({ mime, name })
    },
    DriveApp: { Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 }, getFolderById: () => ({
      createFile(blob) {
        if (files.length + 1 === failAt) throw new Error('Synthetic upload failure');
        files.push(blob);
        return { setSharing() {}, setTrashed(value) { blob.trashed = value; }, getUrl: () => 'https://drive.google.com/file/d/synthetic-' + files.length + '/view' };
      }
    }) }
  });
  const sheet = {
    getLastRow: () => existingIds.length + 1,
    getLastColumn: () => 21,
    appendRow: row => { events.push('append'); rows.push(Array.from(row)); },
    getRange: (...range) => ({
      setNumberFormat(format) { events.push({ range, format }); },
      getValues: () => existingIds.map(id => [id]),
      getDisplayValues: () => existingIds.map(id => [String(id)]),
      sort() {}
    })
  };
  const ss = { getSheetByName: name => name === 'Data_Tamu' ? sheet : null };
  if (bundle) {
    c.getSpreadsheet = () => ss;
    vm.runInContext(fs.readFileSync('Admin/PublicIntake.js', 'utf8'), c);
  } else {
    vm.runInContext(fs.readFileSync('Tamu-Luar/Destinations.js', 'utf8'), c);
    vm.runInContext(fs.readFileSync('Tamu-Luar/Code.js', 'utf8'), c);
    c.getSharedSpreadsheet_ = () => ss;
  }
  return { c, files, rows, events, sheet, ss, register: payload => bundle ? c.publicRegisterTamuLuar(payload) : c.registerTamuLuar(payload) };
}

test('TLD standalone and PublicIntake store every upload while keeping single document URL compatibility', () => {
  for (const bundle of [false, true]) {
    const h = load(bundle);
    assert.equal(h.register(completeTldPayload({ surat_kunjungan_base64: [pdf, image], surat_tugas_base64: pdf })).success, true);
    assert.equal(h.files.length, 3);
    assert.deepEqual(h.files.map(file => file.mime), ['application/pdf', 'image/png', 'application/pdf']);
    assert.equal(new Set(h.files.map(file => file.name)).size, 3);
    assert.equal(JSON.parse(h.rows[0][14]).length, 2);
    assert.match(h.rows[0][15], /^https:\/\//);
    assert.deepEqual(h.events, [{ range: [2, 13, 1, 2], format: '@' }, 'append']);
  }
});

test('multiple TLD documents work with existing scalar-only private validation', () => {
  const h = load();
  assert.throws(() => h.c.validateTldUpload_([pdf, image]), /PDF/);
  assert.equal(h.register(completeTldPayload({ surat_kunjungan_base64: [pdf, image] })).success, true);
  assert.equal(JSON.parse(h.rows[0][14]).length, 2);
});

test('pre-row formatting and append failures clean new uploads while post-row failures retain referenced files', () => {
  for (const bundle of [false, true]) {
    for (const point of ['format', 'append', 'afterRow']) {
      const h = load(bundle);
      if (point === 'format') h.sheet.getRange = () => { throw new Error('Synthetic format failure'); };
      if (point === 'append') h.sheet.appendRow = () => { throw new Error('Synthetic append failure'); };
      if (point === 'afterRow') h.ss.getSheetByName = name => name === 'Data_Tamu' ? h.sheet : {
        getLastRow: () => 1, appendRow() { throw new Error('Synthetic SPPD failure'); }
      };
      assert.throws(() => h.register(completeTldPayload({ surat_kunjungan_base64: [pdf, image] })), /Synthetic/);
      assert.equal(h.files.length, 3);
      assert.equal(h.files.every(file => file.trashed === true), point !== 'afterRow');
      assert.equal(h.rows.length, point === 'afterRow' ? 1 : 0);
    }
  }
});

test('TLD formats visit wall-time columns on the physical append row independently of a gapped ID', () => {
  for (const bundle of [false, true]) {
    const h = load(bundle, 0, [38, 21]);
    h.register(completeTldPayload());
    assert.equal(h.rows[0][0], 39);
    assert.deepEqual(h.events, [{ range: [4, 13, 1, 2], format: '@' }, 'append']);
  }
});

test('failed multi-document upload removes only files created by that submission before any row write', () => {
  for (const bundle of [false, true]) {
    const h = load(bundle, 3);
    assert.throws(() => h.register(completeTldPayload({ surat_kunjungan_base64: [pdf, image], surat_tugas_base64: pdf })), /Synthetic upload failure/);
    assert.equal(h.rows.length, 0);
    assert.equal(h.files.length, 2);
    assert.equal(h.files.every(file => file.trashed === true), true);
  }
});

test('TLD validates all documents before Drive writes and rejects empty, nested, invalid and oversized file lists', () => {
  for (const bundle of [false, true]) {
    for (const documents of [[], [pdf, 'data:text/html;base64,PGgxPg=='], [pdf, ''], [[pdf]], [pdf, 'data:application/pdf;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')]]) {
      const h = load(bundle);
      assert.throws(() => h.register(completeTldPayload({ surat_kunjungan_base64: documents })));
      assert.equal(h.files.length, 0);
      assert.equal(h.rows.length, 0);
    }
  }
});

test('TLD picker retains all chosen documents and serializes each MIME-normalized file', async () => {
  const source = fs.readFileSync('Tamu-Luar/Index.html', 'utf8');
  const fields = { fileSuratKunjungan: { files: [], required: true }, fileSuratKunjunganStatus: {} };
  const selectedDocuments = {};
  const c = vm.createContext({ selectedDocuments, maxUploadBytes: 5 * 1024 * 1024,
    document: { getElementById: id => fields[id] }, FileReader: class {
      readAsDataURL() { this.result = pdf; this.onload(); }
    }
  });
  for (const name of ['documentMimeType', 'documentFileError', 'selectDocument', 'fileToBase64', 'documentsToBase64']) {
    const fn = source.match(new RegExp('    (?:async )?function ' + name + '\\([^]*?\\n    \\}'));
    assert.ok(fn, name);
    vm.runInContext(fn[0], c);
  }
  const first = { name: 'first.pdf', type: '', size: 20 };
  const second = { name: 'second.png', type: 'image/png', size: 20 };
  fields.fileSuratKunjungan.files = [first, second];
  c.selectDocument(fields.fileSuratKunjungan, 'fileSuratKunjungan');
  assert.deepEqual(Array.from(selectedDocuments.fileSuratKunjungan), [first, second]);
  c.selectDocument({ files: [{ name: 'bad.html', type: 'text/html', size: 2 }] }, 'fileSuratKunjungan');
  assert.deepEqual(Array.from(selectedDocuments.fileSuratKunjungan), [first, second]);
  assert.deepEqual(Array.from(await c.documentsToBase64(selectedDocuments.fileSuratKunjungan)), [pdf, 'data:image/png;base64,JVBERg==']);
  assert.equal(await c.documentsToBase64([first]), pdf);
});

test('Admin previews render every stored document and accept a legacy single URL', () => {
  const html = fs.readFileSync('Admin/VisitModal.html', 'utf8');
  const c = vm.createContext({ escapeHtml: value => String(value).replace(/"/g, '&quot;'), visitDocumentPreview: () => '<span>preview</span>' });
  for (const name of ['visitDocumentLinks', 'visitFileLink']) {
    vm.runInContext(html.match(new RegExp('  function ' + name + '\\([^]*?\\n  \\}'))[0], c);
  }
  const urls = ['https://drive.google.com/file/d/one/view', 'https://drive.google.com/file/d/two/view'];
  const result = c.visitDocumentLinks(JSON.stringify(urls), 'Surat');
  assert.equal((result.match(/class="visit-file"/g) || []).length, 2);
  urls.forEach(url => assert.ok(result.includes(url)));
  assert.equal((c.visitDocumentLinks(urls[0], 'Surat').match(/class="visit-file"/g) || []).length, 1);
  assert.equal(c.visitDocumentLinks('["javascript:alert(1)"]', 'Surat'), '');
});

test('local TLD HTTP workflow exposes every uploaded document through the Admin visit', async () => {
  const { createLocalTestServer } = require('../server');
  const server = createLocalTestServer({ now: new Date('2026-11-12T03:00:00Z') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const post = async (name, data) => (await fetch('http://127.0.0.1:' + server.address().port + '/api/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    })).json();
    const response = await post('registerTamuLuar', completeTldPayload({ tanggal_kunjungan: '2026-11-12', surat_kunjungan_base64: [pdf, image], surat_tugas_base64: pdf }));
    assert.equal(response.success, true, response.error);
    const list = await post('getTamuList', {});
    assert.equal(JSON.parse(list.data[0].surat_kunjungan_file).length, 2);
    assert.match(list.data[0].surat_tugas_file, /^\/local-doc\//);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('visit archive expands multi-document cells, retains legacy URLs and deduplicates safely', () => {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync('Admin/VisitArchive.js', 'utf8'), c);
  const first = 'https://drive.google.com/file/d/first/view';
  const second = 'https://drive.google.com/file/d/second/view';
  const data = { visit: { surat_kunjungan_file: JSON.stringify([first, second]), surat_tugas_file: first }, workflow: { files: {} } };
  const result = c.visitArchiveSources_(data, null);
  assert.deepEqual(Array.from(result, item => item.url), [first, second]);
  assert.match(result[1].name, /2/);
});
