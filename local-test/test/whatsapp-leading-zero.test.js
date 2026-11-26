'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadAdmin() {
  const context = vm.createContext({ Utilities: {}, Intl });
  vm.runInContext(fs.readFileSync('Admin/Code.js', 'utf8'), context);
  return context;
}

test('WhatsApp numbers display exactly as entered, restoring a leading 0 lost by Sheets', () => {
  const { formatPhoneVal_ } = loadAdmin();
  assert.equal(formatPhoneVal_('081234567890'), '081234567890');
  assert.equal(formatPhoneVal_(81234567890), '081234567890', 'legacy numeric cell');
  assert.equal(formatPhoneVal_('81234567890'), '081234567890', 'legacy stripped text');
  assert.equal(formatPhoneVal_('+6281234567890'), '+6281234567890');
  assert.equal(formatPhoneVal_(' 6281234567890 '), '6281234567890');
  assert.equal(formatPhoneVal_(''), '');
  assert.equal(formatPhoneVal_(null), '');
  assert.equal(formatPhoneVal_(undefined), '');
});

test('guestbook rows expose the WhatsApp number with its leading 0', () => {
  const { mapVisitRow_ } = loadAdmin();
  const row = Array(21).fill('');
  row[11] = 81234567890;
  assert.equal(mapVisitRow_(row).narahubung_hp, '081234567890');
});

test('Data_Presensi marks the phone column as text before every append', () => {
  const source = fs.readFileSync('Admin/Code.js', 'utf8');
  assert.match(source, /sheet\.getRange\(sheet\.getLastRow\(\)\+1,9\)\.setNumberFormat\('@'\)/);
});

test('Data_Presensi rewrites the phone cell as text after append so the leading 0 is stored', () => {
  const source = fs.readFileSync('Admin/Code.js', 'utf8');
  assert.match(source, /const phoneCell=sheet\.getRange\(sheet\.getLastRow\(\),9\);\s*phoneCell\.setNumberFormat\('@'\);\s*phoneCell\.setValue\(guardSheetPhone_\(p\.no_hp\|\|'-'\)\);/);
});
