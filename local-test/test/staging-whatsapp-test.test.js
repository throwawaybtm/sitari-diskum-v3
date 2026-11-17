'use strict';

// Staging WhatsApp test mode (maintenance/staging/build-staging.js).
// Uses FAKE numbers only. The owner's real test numbers live in the gitignored .staging/config.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const staging = require('../../maintenance/staging/build-staging.js');

const FAKE = { contactPhone: '0812-0000-0001', picPhone: '+62 812 0000 0002' };
const FAKE_NORMALIZED = { contact: '6281200000001', pic: '6281200000002' };
const BASE_CONFIG = { spreadsheetId: 's', folderSuratId: 'a', folderBuktiId: 'b', approverEmail: 'owner@example.test' };

const adminFile = name => fs.readFileSync(path.join(ROOT, 'Admin', name), 'utf8');
const adminSources = () => ({
  'VisitNotifications.js': adminFile('VisitNotifications.js'),
  'VisitWorkflowStorage.js': adminFile('VisitWorkflowStorage.js'),
});

test('test mode is off unless whatsappTest.enabled is exactly true', () => {
  assert.equal(staging.whatsappTestConfig(BASE_CONFIG), null);
  assert.equal(staging.whatsappTestConfig({ ...BASE_CONFIG, whatsappTest: { ...FAKE } }), null);
  assert.equal(staging.whatsappTestConfig({ ...BASE_CONFIG, whatsappTest: { ...FAKE, enabled: 'true' } }), null);
  assert.deepEqual(staging.whatsappTestConfig({ ...BASE_CONFIG, whatsappTest: { ...FAKE, enabled: true } }), FAKE_NORMALIZED);
});

test('test numbers are validated and normalized like the app does', () => {
  const on = phones => staging.whatsappTestConfig({ ...BASE_CONFIG, whatsappTest: { enabled: true, ...phones } });
  assert.deepEqual(on({ contactPhone: '6281200000001', picPhone: '81200000002' }), FAKE_NORMALIZED);
  assert.throws(() => on({ contactPhone: '', picPhone: '081200000002' }), /contactPhone/);
  assert.throws(() => on({ contactPhone: '081200000001', picPhone: 'abc' }), /picPhone/);
});

test('properties keep WhatsApp disabled when test mode is off, and enable it only in test mode', () => {
  assert.equal(staging.stagingProperties(BASE_CONFIG).FONNTE_DISABLED, 'true');
  const on = { ...BASE_CONFIG, whatsappTest: { enabled: true, ...FAKE } };
  assert.equal(staging.stagingProperties(on).FONNTE_DISABLED, 'false');
});

test('StagingConfig.js deletes the token when off and carries the allowlist when on', () => {
  const off = staging.stagingConfigSource(staging.stagingProperties(BASE_CONFIG), null);
  assert.match(off, /deleteProperty\('FONNTE_TOKEN'\)/);
  assert.doesNotMatch(off, /SITARI_STAGING_WA_TEST_/);
  const on = staging.stagingConfigSource(staging.stagingProperties(BASE_CONFIG), FAKE_NORMALIZED);
  assert.doesNotMatch(on, /deleteProperty\('FONNTE_TOKEN'\)/);
  assert.match(on, /SITARI_STAGING_WA_TEST_ = Object\.freeze\(\{"contact":"6281200000001","pic":"6281200000002"\}\)/);
  assert.match(on, /function stagingAssertWhatsappTarget_/);
});

test('every Admin WhatsApp send is redirected to a test number', () => {
  const original = adminSources();
  const patched = staging.applyWhatsappTestPatches(original);
  assert.match(patched['VisitNotifications.js'], /sendVisitWhatsapp_\(SITARI_STAGING_WA_TEST_\.pic,/);
  assert.match(patched['VisitWorkflowStorage.js'], /sendVisitWhatsapp_\(SITARI_STAGING_WA_TEST_\.contact,/);
  assert.match(patched['VisitNotifications.js'], /stagingAssertWhatsappTarget_\(normalizeVisitWhatsappPhone_\(phone\)\)/);
  assert.match(patched['VisitNotifications.js'], /message:SITARI_STAGING_WA_PREFIX_\+message,/);
  assert.doesNotMatch(patched['VisitNotifications.js'], /sendVisitWhatsapp_\(item\.phone,/);
  assert.doesNotMatch(patched['VisitWorkflowStorage.js'], /sendVisitWhatsapp_\(data\.visit\.narahubung_hp,/);
  // The production sources are not modified.
  assert.deepEqual(original, adminSources());
});

test('the build fails closed if the Admin code no longer matches an anchor', () => {
  const files = adminSources();
  files['VisitNotifications.js'] = files['VisitNotifications.js'].replace('sendVisitWhatsapp_(item.phone,', 'sendVisitWhatsapp_(item.hp,');
  assert.throws(() => staging.applyWhatsappTestPatches(files), /anchor in VisitNotifications\.js matched 0 times/);
});

test('the safety net rejects any unredirected send or extra Fonnte call', () => {
  assert.throws(() => staging.assertWhatsappRedirected({ 'Other.js': 'x=sendVisitWhatsapp_(row.phone,"hi");' }), /not redirected/);
  assert.throws(() => staging.assertWhatsappRedirected({ 'Other.js': 'UrlFetchApp.fetch("https://api.fonnte.com/send")' }), /unexpected Fonnte call/);
  assert.doesNotThrow(() => staging.assertWhatsappRedirected({ 'A.js': 'function sendVisitWhatsapp_(phone,message){}' }));
});

function runPatchedNotifications() {
  const fetches = [];
  const props = { FONNTE_TOKEN: 'fake-token' };
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => (key in props ? props[key] : null),
      getProperties: () => ({ ...props }),
      setProperties: changes => Object.assign(props, changes),
      deleteProperty: key => { delete props[key]; },
    }) },
    UrlFetchApp: { fetch: (url, options) => {
      fetches.push({ url, target: options.payload.target, message: options.payload.message });
      return { getResponseCode: () => 200, getContentText: () => '{"status":true}' };
    } },
    // A PIC whose directory number is NOT a test number: it must never be used.
    VISIT_PIC_CONTACTS: [{ id: 'P1', pic: 'Petugas Uji', phone: '081299999999' }],
  };
  vm.createContext(context);
  vm.runInContext(staging.stagingConfigSource(staging.stagingProperties({ ...BASE_CONFIG, whatsappTest: { enabled: true, ...FAKE } }), FAKE_NORMALIZED), context);
  vm.runInContext(staging.applyWhatsappTestPatches(adminSources())['VisitNotifications.js'], context);
  return { context, fetches, props };
}

test('at runtime the PIC message goes to the PIC test number, marked as a staging test', () => {
  const { context, fetches, props } = runPatchedNotifications();
  assert.equal(props.FONNTE_DISABLED, 'false');
  assert.equal(props.FONNTE_TOKEN, 'fake-token');
  const visit = { kode_kunjungan: 'TLD-UJI-1', instansi: 'Instansi Uji', keperluan: 'Uji', tujuan_bidang: 'Bidang Uji', lo_nama: 'Petugas Uji', lo_id: 'P1', tanggal_kunjungan: '2026-11-20', jam_kunjungan: '09:00' };
  const result = context.notifyVisitPics_(visit, [], {});
  assert.equal(result.length, 1);
  assert.equal(result[0].success, true);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].target, FAKE_NORMALIZED.pic);
  assert.ok(fetches[0].message.startsWith(staging.WHATSAPP_TEST_PREFIX));
});

test('at runtime the contact number goes to the contact test number, and any other number is refused', () => {
  const { context, fetches } = runPatchedNotifications();
  context.sendVisitWhatsapp_(context.SITARI_STAGING_WA_TEST_.contact, 'hello');
  assert.equal(fetches.at(-1).target, FAKE_NORMALIZED.contact);
  assert.throws(() => context.sendVisitWhatsapp_('081299999999', 'hello'), /di luar daftar uji/);
  assert.equal(fetches.length, 1, 'no request is made for a number outside the test list');
});
