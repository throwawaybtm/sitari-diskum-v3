'use strict';

// Pins behaviour synced from live version 50 (commit d0e4c67): a visit's letter field may hold one URL
// or a JSON array of URLs (multiple uploads). Single-URL legacy rows must keep working.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function archiveContext() {
  const context = vm.createContext({});
  vm.runInContext(read('Admin/VisitArchive.js'), context);
  return context;
}

const A = 'https://drive.example/file-a';
const B = 'https://drive.example/file-b';

test('visitDocumentUrls_ accepts a legacy single URL, a JSON array, an array and empty values', () => {
  const { visitDocumentUrls_ } = archiveContext();
  assert.deepEqual(Array.from(visitDocumentUrls_(A)), [A]);
  assert.deepEqual(Array.from(visitDocumentUrls_(JSON.stringify([A, B]))), [A, B]);
  assert.deepEqual(Array.from(visitDocumentUrls_([A, '', 7, B])), [A, B]);
  for (const empty of ['', '   ', null, undefined, '[]', '[not json']) {
    assert.deepEqual(Array.from(visitDocumentUrls_(empty)), [], String(empty));
  }
});

test('visitDocumentSources_ numbers labels only when there is more than one document', () => {
  const { visitDocumentSources_ } = archiveContext();
  assert.deepEqual(JSON.parse(JSON.stringify(visitDocumentSources_(A, 'Surat'))), [{ name: 'Surat', url: A }]);
  assert.deepEqual(JSON.parse(JSON.stringify(visitDocumentSources_(JSON.stringify([A, B]), 'Surat'))), [
    { name: 'Surat 1', url: A }, { name: 'Surat 2', url: B }
  ]);
  assert.deepEqual(Array.from(visitDocumentSources_('', 'Surat')), []);
});

test('visit archive sources list every uploaded letter', () => {
  const source = read('Admin/VisitArchive.js');
  assert.match(source, /\.\.\.visitDocumentSources_\(v\.surat_kunjungan_file,/);
  assert.match(source, /\.\.\.visitDocumentSources_\(v\.surat_tugas_file,/);
});

test('visit modal renders one link per uploaded letter and keeps legacy single links', () => {
  const html = read('Admin/VisitModal.html');
  const helper = html.match(/function visitDocumentLinks\(value, label\) \{[\s\S]*?\n  \}/);
  assert.ok(helper, 'visitDocumentLinks helper is present');
  const calls = [];
  const context = vm.createContext({ visitFileLink: (file, label) => { calls.push([file.url, label]); return '<a>' + label + '</a>'; } });
  vm.runInContext(helper[0], context);
  assert.equal(context.visitDocumentLinks(A, 'Surat'), '<a>Surat</a>');
  assert.deepEqual(calls.splice(0), [[A, 'Surat']]);
  assert.equal(context.visitDocumentLinks(JSON.stringify([A, B]), 'Surat'), '<a>Surat 1</a><a>Surat 2</a>');
  assert.deepEqual(calls.splice(0), [[A, 'Surat 1'], [B, 'Surat 2']]);
  assert.match(html, /visitDocumentLinks\(v\.surat_kunjungan_file,/);
  assert.match(html, /visitDocumentLinks\(v\.surat_tugas_file,/);
});

test('first-load edits survive the live sync (compiled Tailwind include and allowlist)', () => {
  assert.match(read('Admin/Code.js'), /ADMIN_INCLUDE_FILES_\s*=\s*\[[^\]]*'TailwindCompiled'/);
  assert.match(read('Admin/Presensi.html'), /<\?!= include\('TailwindCompiled'\); \?>/);
  assert.doesNotMatch(read('Admin/Presensi.html'), /cdn\.tailwindcss\.com/);
});
