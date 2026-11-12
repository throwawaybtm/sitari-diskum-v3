'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const file of ['Public/Tld.html', 'Public/Tdd.html', 'Public/Presensi.html', 'Tamu-Luar/Index.html', 'Tamu-FO/Index.html', 'Admin/Presensi.html']) {
  test(`${file} replaces OAuth failures while preserving visitor validation`, () => {
    const source = fs.readFileSync(file, 'utf8');
    const helper = source.match(/function publicErrorMessage\(error\) \{[\s\S]*?\n    \}/);
    assert.ok(helper, 'public error formatter is available');
    const context = vm.createContext({});
    vm.runInContext(helper[0], context);
    for (const message of [
      'Specified permissions are not sufficient to call Session.getEffectiveUser. Required permissions: https://www.googleapis.com/auth/userinfo.email',
      'Authorization is required to perform that action.',
      'Exception: Access denied: DriveApp',
      'TypeError: Cannot read properties of undefined'
    ]) {
      assert.equal(context.publicErrorMessage({ message }), 'Layanan sedang tidak tersedia. Silakan coba lagi atau hubungi petugas.');
    }
    assert.equal(context.publicErrorMessage('Nama peserta wajib diisi.'), 'Nama peserta wajib diisi.');
  });
}
