'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const presensi = read('Admin/Presensi.html');
const head = presensi.slice(presensi.indexOf('<head>'), presensi.indexOf('</head>'));
const compiled = read('Admin/TailwindCompiled.html');

function get(server, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: pathname }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

test('Admin/Presensi.html no longer loads the Tailwind Play CDN', () => {
  assert.doesNotMatch(presensi, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(head, /<script\b[^>]*\btailwind/i);
});

test('Presensi has no custom Tailwind config, @apply or text/tailwindcss block (precompiling is safe)', () => {
  assert.doesNotMatch(presensi, /tailwind\.config/);
  assert.doesNotMatch(presensi, /@apply\b/);
  assert.doesNotMatch(presensi, /type=["']text\/tailwindcss["']/);
});

test('Presensi includes the compiled CSS once, in <head>, after its own <style> block (Play CDN cascade order)', () => {
  const includeTag = "<?!= include('TailwindCompiled'); ?>";
  assert.equal(presensi.split(includeTag).length - 1, 1, 'included exactly once');
  const styleEnd = head.lastIndexOf('</style>');
  assert.ok(styleEnd > 0, 'Presensi keeps its own <style> block');
  assert.ok(head.indexOf(includeTag) > styleEnd, 'compiled CSS must follow the page stylesheet');
});

test('Presensi pulls in no PDF libraries (nothing to defer)', () => {
  assert.doesNotMatch(presensi, /jspdf|pdf-lib/i);
});

test('TailwindCompiled stays allowlisted for the doGet include path used by both Presensi pages', () => {
  const code = read('Admin/Code.js');
  assert.match(code, /ADMIN_INCLUDE_FILES_\s*=\s*\[[^\]]*'TailwindCompiled'/);
  assert.match(code, /createTemplateFromFile\('Presensi'\)/);
  assert.match(code, /page === 'presensi'\s*\|\|\s*adminAttendance/);
});

test('local preview serves both Presensi pages with the compiled CSS and no CDN script', async () => {
  const { createLocalTestServer } = require('../server');
  const server = createLocalTestServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const page of ['presensi', 'presensi-admin']) {
      const { status, body } = await get(server, `/?page=${page}`);
      assert.equal(status, 200, page);
      assert.doesNotMatch(body, /cdn\.tailwindcss\.com/, page);
      assert.match(body, /<style id="tailwind-compiled">/, page);
      assert.doesNotMatch(body, /include\('TailwindCompiled'\)/, page);
      assert.ok(body.indexOf('id="tailwind-compiled"') > body.indexOf('#participantCategories'), `${page}: compiled CSS follows the page stylesheet`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

// Classes assigned from JavaScript are invisible to a first-paint comparison, so check the literals directly.
function escapeClass(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
}

test('classes assigned from JavaScript in Presensi are all present in the compiled CSS', () => {
  const classes = new Set();
  const lines = presensi.split('\n').filter(line => /\bclassName\s*=|classList\.(add|remove|toggle)\(/.test(line));
  assert.ok(lines.length >= 4, 'expected JavaScript class assignments in Presensi');
  for (const line of lines) {
    for (const [, literal] of line.matchAll(/'([^']*)'/g)) {
      for (const name of literal.split(/\s+/).filter(Boolean)) classes.add(name);
    }
  }
  const dynamic = [...classes].filter(name => /^[a-z]/.test(name) && /[a-z]-|^[a-z]+:/.test(name));
  assert.ok(dynamic.length > 5, 'expected several Tailwind classes assigned from JavaScript');
  const missing = dynamic.filter(name => !compiled.includes('.' + escapeClass(name)));
  assert.deepEqual(missing, [], 'JavaScript-assigned classes missing from Admin/TailwindCompiled.html (rebuild with node maintenance/build-tailwind.js)');
});

test('no Presensi class name is assembled from string fragments', () => {
  // A fragment such as 'bg-' + color would not be seen by the Tailwind compiler.
  const fragments = presensi.match(/['"`][^'"`\n]*\b(?:bg|text|border|ring|from|via|to|p|px|py|m|mx|my|w|h|gap|rounded|shadow)-['"`]\s*\+/g) || [];
  assert.deepEqual(fragments, []);
  assert.doesNotMatch(presensi, /class(?:Name)?\s*=\s*[`][^`]*\$\{/, 'no template-literal class interpolation');
});
