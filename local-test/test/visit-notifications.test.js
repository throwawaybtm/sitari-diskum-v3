'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

function createFonnteContext({ contacts = [], token = 'test-fonnte-token', responseStatus = 200, responseBody = { status: true }, props = {} } = {}) {
  const requests = [];
  const mergedProps = Object.assign({ FONNTE_TOKEN: token }, props);
  const context = vm.createContext({
    VISIT_PIC_CONTACTS: contacts,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => (Object.prototype.hasOwnProperty.call(mergedProps, key) ? mergedProps[key] : '')
      })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        requests.push({ url, options });
        return {
          getResponseCode: () => responseStatus,
          getContentText: () => typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
        };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin/VisitNotifications.js'), 'utf8'), context);
  return { context, requests };
}

test('sendVisitWhatsapp_ normalizes Indonesian phone formats to 62-format and rejects invalid numbers', () => {
  const cases = [
    ['0800-0000-0101', '6280000000101'],
    ['+62 800-0000-0202', '6280000000202'],
    ['6280000000303', '6280000000303'],
    ['0062 (800) 0000-0404', '6280000000404'],
    ['800.0000.0505', '6280000000505']
  ];

  for (const [input, expectedTarget] of cases) {
    const { context, requests } = createFonnteContext();
    const res = context.sendVisitWhatsapp_(input, 'Pesan uji');
    assert.equal(res.success, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.fonnte.com/send');
    assert.equal(requests[0].options.payload.target, expectedTarget, `normalized ${input}`);
    assert.equal(requests[0].options.payload.countryCode, '62');
    assert.equal(requests[0].options.payload.connectOnly, 'true');
  }

  for (const bad of ['', null, 'PHONE_NUMBER_PLACEHOLDER', '08123', 'abc-12345678', '081234567890123']) {
    const { context, requests } = createFonnteContext();
    assert.throws(() => context.sendVisitWhatsapp_(bad, 'Pesan uji'), /tidak valid/i, String(bad));
    assert.equal(requests.length, 0, 'invalid numbers never trigger Fonnte HTTP requests');
  }
});

test('notifyVisitPics_ sends normalized 62-format numbers for updated PICs, skips already sent, and falls back by lo_id', () => {
  const syntheticContacts = [
    { id: 'pengembangan-mikro', bidang: 'Bidang Pengembangan Usaha Mikro', pic: 'PIC Mikro Uji', phone: '0800-0000-0101' },
    { id: 'kewirausahaan', bidang: 'Bidang Kewirausahaan', pic: 'PIC Wirausaha Uji', phone: '+62 800-0000-0202' },
    { id: 'pengawasan-koperasi', bidang: 'Bidang Pengawasan Koperasi', pic: 'PIC Koperasi Uji', phone: '6280000000303' },
    { id: 'plut-kumkm', bidang: 'UPTD PLUT KUMKM', pic: 'PIC Placeholder Uji', phone: 'PHONE_NUMBER_PLACEHOLDER' }
  ];

  const { context, requests } = createFonnteContext({ contacts: syntheticContacts });
  const visit = {
    kode_kunjungan: 'TLD-11112026-001',
    instansi: 'Dinas Uji Daerah',
    keperluan: 'Koordinasi UMKM',
    tanggal_kunjungan: '2026-11-11',
    jam_kunjungan: '09:00',
    tujuan_bidang: 'Bidang Pengembangan Usaha Mikro; Bidang Kewirausahaan; Bidang Pengawasan Koperasi',
    lo_id: 'pengembangan-mikro; kewirausahaan; pengawasan-koperasi',
    lo_nama: 'PIC Mikro Uji; PIC Wirausaha Uji; PIC Koperasi Uji'
  };
  const previous = [{ pic: 'PIC Koperasi Uji', success: true, delivery: 'pending', at: '2026-11-11T01:00:00Z' }];

  const results = context.notifyVisitPics_(visit, previous, { tanggal: '2026-11-12', jam: '10:00' });
  assert.equal(results.length, 3);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, true);
  assert.equal(results[2], previous[0]);
  assert.deepEqual(requests.map(r => r.options.payload.target), ['6280000000101', '6280000000202']);

  // Fallback by directory lo_id when an existing visit carries an older PIC name
  const legacyVisit = {
    ...visit,
    tujuan_bidang: 'Bidang Pengembangan Usaha Mikro',
    lo_id: 'pengembangan-mikro',
    lo_nama: 'PIC Lama Mikro'
  };
  const legacyRes = context.notifyVisitPics_(legacyVisit, [], {});
  assert.equal(legacyRes.length, 1);
  assert.equal(legacyRes[0].pic, 'PIC Lama Mikro');
  assert.equal(legacyRes[0].success, true);
  assert.equal(requests[2].options.payload.target, '6280000000101');

  // Unconfigured or missing PIC contact fails per-recipient without crashing the batch
  const errRes = context.notifyVisitPics_({
    ...visit,
    tujuan_bidang: 'UPTD PLUT KUMKM; Tidak Ada',
    lo_id: 'plut-kumkm; none',
    lo_nama: 'PIC Placeholder Uji; PIC Hilang'
  }, [], {});
  assert.equal(errRes[0].success, false);
  assert.match(errRes[0].error, /tidak valid/i);
  assert.equal(errRes[1].success, false);
  assert.match(errRes[1].error, /belum tersedia/i);
});

test('saveVisitWorkflow sends normalized 62-format numbers via Fonnte for notifyContact and notify', () => {
  const requests = [];
  const syntheticContacts = [
    { id: 'pengembangan-mikro', bidang: 'Bidang Pengembangan Usaha Mikro', pic: 'PIC Mikro Uji', phone: '0800-1111-2222' },
    { id: 'kewirausahaan', bidang: 'Bidang Kewirausahaan', pic: 'PIC Wirausaha Uji', phone: '0800-3333-4444' }
  ];
  const visitValues = [
    1, 'TLD-11112026-010', 'luar_daerah', 'Instansi Uji', 'Alamat Uji', 2, 'Ketua Uji', 'Ketua Uji\nAnggota Uji',
    '', 'Koordinasi', 'Ketua Uji', '0800-5555-6666', '2026-11-11', '09:00', '', '', '', '', 1, 'Menunggu Konfirmasi'
  ];
  function makeSheet(rows = []) {
    return {
      rows,
      getLastRow: () => rows.length,
      getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
      appendRow: r => rows.push(Array.from(r)),
      getRange(row, col, count = 1, width = 1) {
        return {
          getValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => rows[row - 1 + i]?.[col - 1 + j] ?? '')),
          setValues: values => values.forEach((r, i) => r.forEach((v, j) => { rows[row - 1 + i] ||= []; rows[row - 1 + i][col - 1 + j] = v; })),
          setValue: value => { rows[row - 1] ||= []; rows[row - 1][col - 1] = value; },
          setNumberFormat: () => this
        };
      }
    };
  }
  const sheets = { Data_Tamu: makeSheet([[], visitValues]), Kendali_SPPD: makeSheet([[]]) };
  const context = vm.createContext({
    Session: { getActiveUser: () => ({ getEmail: () => 'admin@test.invalid' }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => ({ APPROVER_EMAIL: 'admin@test.invalid', FONNTE_TOKEN: 'test-fonnte-token' }[key] || '')
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    Utilities: {
      formatDate: () => '2026-11-11',
      getUuid: () => 'uuid-1',
      base64Decode: v => Buffer.from(v, 'base64'),
      newBlob: (b, m, n) => ({ b, m, n })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => ({ createFile: () => ({ setSharing() {}, getUrl: () => 'https://example.invalid/doc' }) })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        requests.push({ url, options });
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ status: true }) };
      }
    }
  });
  for (const file of ['Code.js', 'VisitWorkflow.js', 'VisitWorkflowStorage.js', 'VisitNotifications.js', 'VisitArchive.js', 'AgendaDocuments.js', 'MeetingRooms.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin', file), 'utf8'), context);
  }
  context.VISIT_PIC_CONTACTS = syntheticContacts;
  context.getSpreadsheet = () => ({ getSheetByName: name => sheets[name], insertSheet: name => (sheets[name] = makeSheet([[]])) });
  context.getMasterData = () => ({ data: { ruangan: [{ id: 1, nama_ruangan: 'Ruang Rapat', kapasitas: 20 }] } });
  context.getRapatCalendar = () => ({ data: [] });
  context.getAgendaNotula_ = () => null;
  context.getApprovalActor_ = () => 'Admin';
  context.setupGoogleDriveFolders = () => ({ buktiId: 'bukti-folder' });

  let res = context.saveVisitWorkflow({
    kode_kunjungan: 'TLD-11112026-010',
    version: 0,
    action: 'destinations',
    destinations: ['Bidang Pengembangan Usaha Mikro', 'Bidang Kewirausahaan']
  });
  assert.equal(res.success, true, res.error);
  assert.equal(res.data.visit.lo_nama, 'PIC Mikro Uji; PIC Wirausaha Uji');

  res = context.saveVisitWorkflow({ kode_kunjungan: 'TLD-11112026-010', version: res.data.workflow.version, action: 'notifyContact' });
  assert.equal(res.success, true, res.error);
  assert.equal(requests[0].options.payload.target, '6280055556666');

  res = context.saveVisitWorkflow({ kode_kunjungan: 'TLD-11112026-010', version: res.data.workflow.version, action: 'confirm' });
  assert.equal(res.success, true, res.error);

  res = context.saveVisitWorkflow({
    kode_kunjungan: 'TLD-11112026-010',
    version: res.data.workflow.version,
    action: 'disposisi',
    file: { name: 'disposisi.pdf', data: 'data:application/pdf;base64,JVBERg==' }
  });
  assert.equal(res.success, true, res.error);

  res = context.saveVisitWorkflow({ kode_kunjungan: 'TLD-11112026-010', version: res.data.workflow.version, action: 'notify' });
  assert.equal(res.success, true, res.error);
  assert.deepEqual(requests.slice(1).map(r => r.options.payload.target), ['6280011112222', '6280033334444']);
});

test('PIC directory configs stay in parity across Admin, Tamu-FO, Tamu-Luar, and PublicIntake without exposing phone numbers', () => {
  const adminCtx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin/VisitPicContacts.js'), 'utf8'), adminCtx);
  const clone = value => JSON.parse(JSON.stringify(value));
  const adminList = clone(vm.runInContext('VISIT_PIC_CONTACTS', adminCtx));

  const foCtx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Tamu-FO/Destinations.js'), 'utf8'), foCtx);
  const foList = clone(vm.runInContext('TDD_DESTINATIONS', foCtx));

  const luarCtx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Tamu-Luar/Destinations.js'), 'utf8'), luarCtx);
  const luarList = clone(vm.runInContext('TLD_DESTINATIONS', luarCtx));

  const intakeCtx = vm.createContext({ getSpreadsheet: () => ({}) });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin/PublicIntake.js'), 'utf8'), intakeCtx);

  assert.equal(adminList.length, 9);
  assert.deepEqual(foList, adminList);
  assert.deepEqual(luarList, adminList);

  const publicFields = list => list.map(({ id, bidang, pic }) => ({ id, bidang, pic }));
  assert.deepEqual(publicFields(foList), publicFields(adminList));
  assert.deepEqual(
    clone(intakeCtx.getPublicFormDestinations('tdd')),
    adminList.map(({ bidang, pic }) => ({ bidang, pic }))
  );
  assert.deepEqual(
    clone(intakeCtx.getPublicFormDestinations('tld')),
    adminList.map(({ bidang, pic }) => ({ bidang, pic }))
  );

  // Any configured non-placeholder phone must be valid normalized 62-format and work through notifyVisitPics_.
  const configured = adminList.filter(item => item.phone !== 'PHONE_NUMBER_PLACEHOLDER');
  for (const item of configured) {
    assert.match(item.phone, /^62\d{8,13}$/, `normalized 62-format required for ${item.id}`);
  }
  if (configured.length) {
    const { context, requests } = createFonnteContext({ contacts: adminList });
    const notifyResults = context.notifyVisitPics_({
      kode_kunjungan: 'TLD-11112026-099',
      instansi: 'Instansi Uji',
      keperluan: 'Koordinasi',
      tanggal_kunjungan: '2026-11-11',
      jam_kunjungan: '09:00',
      tujuan_bidang: configured.map(item => item.bidang).join('; '),
      lo_id: configured.map(item => item.id).join('; '),
      lo_nama: configured.map(item => item.pic).join('; ')
    }, [], {});
    assert.equal(notifyResults.length, configured.length);
    assert.ok(notifyResults.every(entry => entry.success === true));
    assert.equal(requests.length, configured.length);
    for (let i = 0; i < configured.length; i++) {
      assert.match(requests[i].options.payload.target, /^62\d{8,13}$/);
      assert.equal(requests[i].options.payload.target, configured[i].phone);
    }
  }
  assert.doesNotMatch(JSON.stringify(foCtx.getTddPublicDestinations_()), /phone|PHONE_NUMBER_PLACEHOLDER/);
  assert.doesNotMatch(JSON.stringify(luarCtx.getTldPublicDestinations_()), /phone|PHONE_NUMBER_PLACEHOLDER/);
});

test('FONNTE_DISABLED centrally blocks all outgoing Fonnte requests while preserving validation and workflow progress', () => {
  const contacts = [
    { id: 'pengembangan-mikro', bidang: 'Bidang Pengembangan Usaha Mikro', pic: 'PIC Mikro Uji', phone: '0800-0000-0101' },
    { id: 'kewirausahaan', bidang: 'Bidang Kewirausahaan', pic: 'PIC Wirausaha Uji', phone: '+62 800-0000-0202' }
  ];

  // Disabled with missing FONNTE_TOKEN AND disabled with valid FONNTE_TOKEN must both skip HTTP cleanly
  for (const token of ['', 'real-fonnte-token']) {
    const { context, requests } = createFonnteContext({
      contacts,
      token,
      props: { FONNTE_DISABLED: 'true' }
    });
    const contactRes = context.sendVisitWhatsapp_('0812-3456-7890', 'Pesan Uji');
    assert.equal(contactRes.success, true);
    assert.equal(contactRes.sent, false);
    assert.equal(contactRes.skipped, true);
    assert.equal(contactRes.disabled, true);
    assert.equal(contactRes.delivery, 'disabled');
    assert.equal(requests.length, 0);

    // Even empty/incomplete legacy phone strings do not throw when Fonnte is disabled
    const legacyContactRes = context.sendVisitWhatsapp_('081', 'Pesan Uji');
    assert.equal(legacyContactRes.success, true);
    assert.equal(legacyContactRes.disabled, true);
    assert.equal(requests.length, 0);

    const picRes = context.notifyVisitPics_({
      kode_kunjungan: 'TLD-12112026-001',
      instansi: 'Dinas Uji',
      keperluan: 'Rapat Koordinasi',
      tanggal_kunjungan: '2026-11-12',
      jam_kunjungan: '09:00',
      tujuan_bidang: contacts.map(c => c.bidang).join('; '),
      lo_id: contacts.map(c => c.id).join('; '),
      lo_nama: contacts.map(c => c.pic).join('; ')
    }, [], {});
    assert.equal(picRes.length, 2);
    assert.ok(picRes.every(item => item.success === true && item.sent === false && item.disabled === true && item.delivery === 'disabled'));
    assert.equal(requests.length, 0);
  }

  // VisitModal UI reflects disabled Fonnte delivery transparently without claiming a WhatsApp message was sent
  const modalHtml = fs.readFileSync(path.join(ROOT, 'Admin/VisitModal.html'), 'utf8');
  const fields = {};
  const modalCtx = vm.createContext({
    document: { addEventListener() {}, getElementById: id => (id === 'visitDisposisi' ? null : (fields[id] ||= {})) },
    escapeHtml: v => String(v ?? ''),
    formatMeetingDate: v => v
  });
  vm.runInContext(modalHtml.match(/<script>([^]*?)<\/script>/)[1], modalCtx);
  modalCtx.data = {
    visit: { kode_kunjungan: 'TLD-12112026-001', tujuan_bidang: 'Bidang Pengembangan Usaha Mikro', lo_nama: 'PIC Mikro Uji', tanggal_kunjungan: '2026-11-12', jam_kunjungan: '09:00' },
    workflow: { status: 'Menunggu Konfirmasi', contactNotification: { success: true, disabled: true, sent: false }, notifications: [] },
    stage: 0,
    rooms: [],
    simulated: false,
    fonnteDisabled: true
  };
  vm.runInContext('visitModalData=data;visitModalTab=0;renderVisitWorkflow();', modalCtx);
  assert.match(fields.visitModalContent.innerHTML, /Notifikasi narahubung dilewati \(Fonnte nonaktif\)/);
  assert.doesNotMatch(fields.visitModalContent.innerHTML, /Notifikasi narahubung dikirim/);

  modalCtx.data.stage = 2;
  modalCtx.data.workflow.status = 'Sudah Disposisi';
  modalCtx.data.workflow.notifications = [{ pic: 'PIC Mikro Uji', success: true, disabled: true, sent: false }];
  vm.runInContext('visitModalTab=2;renderVisitWorkflow();', modalCtx);
  assert.match(fields.visitModalContent.innerHTML, /Dilewati \(Fonnte nonaktif\)/);
  assert.match(fields.visitModalContent.innerHTML, /Notifikasi dilewati \(Fonnte nonaktif\)/);
  assert.doesNotMatch(fields.visitModalContent.innerHTML, /Pesan diterima Fonnte/);
});
