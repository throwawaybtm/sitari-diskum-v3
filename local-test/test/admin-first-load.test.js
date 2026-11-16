'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const indexHtml = fs.readFileSync(path.join(ROOT, 'Admin/Index.html'), 'utf8');
const head = indexHtml.slice(indexHtml.indexOf('<head>'), indexHtml.indexOf('</head>'));

const PDF_LIBS = [
  { name: 'jspdf', pattern: /https:\/\/cdn\.jsdelivr\.net\/npm\/jspdf@4\.2\.1\/dist\/jspdf\.umd\.min\.js/, integrity: 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3' },
  { name: 'pdf-lib', pattern: /https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@1\.17\.1\/dist\/pdf-lib\.min\.js/, integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI' }
];

function loaderSource() {
  const match = head.match(/<script id="pdf-library-loader">([\s\S]*?)<\/script>/);
  assert.ok(match, 'Admin/Index.html head must contain <script id="pdf-library-loader">');
  return match[1];
}

function runLoader() {
  const listeners = {};
  const appended = [];
  const timers = [];
  const document = {
    readyState: 'loading',
    head: { appendChild(node) { appended.push(node); return node; } },
    createElement(tag) { return { tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  };
  const context = { document, setTimeout: fn => timers.push(fn), window: {} };
  context.window = context;
  vm.runInNewContext(loaderSource(), context);
  return {
    appended,
    fireDomContentLoaded() { (listeners.DOMContentLoaded || []).forEach(fn => fn()); },
    flushTimers() { while (timers.length) timers.shift()(); },
    document
  };
}

test('PDF libraries are not parser-attached scripts that gate DOMContentLoaded', () => {
  for (const lib of PDF_LIBS) {
    const tags = (head.match(/<script\b[^>]*>/g) || []).filter(tag => lib.pattern.test(tag));
    assert.deepEqual(tags, [], `${lib.name} must not be a <script src> in <head>; it would delay DOMContentLoaded and the first dashboard request`);
  }
});

test('PDF libraries load after DOMContentLoaded with their SRI and crossorigin intact', () => {
  const loader = runLoader();
  assert.equal(loader.appended.length, 0, 'nothing may be injected before DOMContentLoaded');
  loader.fireDomContentLoaded();
  assert.equal(loader.appended.length, 0, 'injection must be deferred past the DOMContentLoaded handlers (initializeApp runs first)');
  loader.flushTimers();
  assert.equal(loader.appended.length, PDF_LIBS.length);
  for (const lib of PDF_LIBS) {
    const node = loader.appended.find(item => lib.pattern.test(item.attrs.src || ''));
    assert.ok(node, `${lib.name} should be injected`);
    assert.equal(node.tag, 'script');
    assert.equal(node.attrs.integrity, lib.integrity);
    assert.equal(node.attrs.crossorigin, 'anonymous');
  }
});

test('PDF library loader is idempotent', () => {
  const loader = runLoader();
  loader.fireDomContentLoaded();
  loader.flushTimers();
  loader.fireDomContentLoaded();
  loader.flushTimers();
  assert.equal(loader.appended.length, PDF_LIBS.length);
});

test('Admin dashboard requests still start from initializeApp on DOMContentLoaded', () => {
  assert.match(indexHtml, /document\.addEventListener\('DOMContentLoaded', initializeApp, \{ once: true \}\)/);
  assert.match(indexHtml, /function initializeApp\(\) \{[\s\S]*?loadAllDashboard\(\);/);
});

test('every PDF library use in the Admin client is preceded by a guard with a reload hint', () => {
  const files = ['Admin/ArchiveClient.html', 'Admin/Tools.html', 'Admin/NotulaPdf.html'];
  const uses = [
    { name: 'jspdf', use: /new\s+jspdf\.jsPDF\s*\(/g, guard: /typeof\s+jspdf\s*===\s*'undefined'\s*\)\s*throw\s+new\s+Error\('Pustaka PDF belum termuat\. Muat ulang halaman\.'\)/g },
    { name: 'PDFLib', use: /PDFLib\.[A-Za-z]+/g, guard: /typeof\s+PDFLib\s*===\s*'undefined'\s*\)\s*throw\s+new\s+Error\('Pustaka arsip PDF belum termuat\. Muat ulang halaman\.'\)/g }
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const lib of uses) {
      const useCount = (src.match(lib.use) || []).length;
      const guardCount = (src.match(lib.guard) || []).length;
      if (useCount === 0) continue;
      assert.ok(guardCount >= 1, `${file}: ${lib.name} is used ${useCount}x but has no guard with reload hint`);
      const firstUse = src.search(lib.use);
      const firstGuard = src.search(lib.guard);
      assert.ok(firstGuard < firstUse, `${file}: first ${lib.name} use comes before its guard`);
    }
  }
  const total = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  assert.ok(/typeof\s+jspdf\s*===/.test(total) && /typeof\s+PDFLib\s*===/.test(total));
});
