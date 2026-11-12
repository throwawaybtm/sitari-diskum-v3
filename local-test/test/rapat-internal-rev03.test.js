'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer, renderAdminHtml } = require('../server');
const { rooms } = require('../meeting-rooms');
const { completeMeetingPayload } = require('./meeting-test-data');

const IMAGE_DATA = 'data:image/jpeg;base64,/9j/2Q==';
const PDF_DATA = 'data:application/pdf;base64,JVBERg==';

function extractFn(source, name) {
  const match = source.match(new RegExp(`    (?:async\\s+)?function ${name}\\([^]*?\\n    \\}`));
  assert.ok(match, `Expected function ${name} in source`);
  return match[0];
}

function createFakeSheet(initialRows = []) {
  const rows = initialRows.map(r => r.slice());
  return {
    rows,
    getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
    getLastRow: () => rows.length + 1,
    getLastColumn: () => (rows[0] ? rows[0].length : 14),
    appendRow: row => rows.push(Array.from(row)),
    getRange: (r, c, n = 1, w = 1) => ({
      getValues: () => rows.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w)),
      getDisplayValues: () => rows.slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w).map(v => String(v ?? ''))),
      setValues: values => values.forEach((vals, i) => {
        const idx = r - 2 + i;
        while (rows.length <= idx) rows.push([]);
        vals.forEach((v, j) => { rows[idx][c - 1 + j] = v; });
      }),
      setValue: val => {
        const idx = r - 2;
        while (rows.length <= idx) rows.push([]);
        rows[idx][c - 1] = val;
      },
      setNumberFormat() { return this; }
    })
  };
}

function createGasHarness({ initialMeetings = [], initialDocs = [], initialPhotos = [], isAdmin = true } = {}) {
  const sheets = new Map();
  if (initialMeetings.length) sheets.set('Data_Rapat', createFakeSheet(initialMeetings));
  else sheets.set('Data_Rapat', createFakeSheet([]));
  if (initialDocs.length) sheets.set('Dokumen_Agenda', createFakeSheet(initialDocs));
  if (initialPhotos.length) sheets.set('Foto_Agenda', createFakeSheet(initialPhotos));

  const driveWrites = [];
  const ss = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      const sheet = createFakeSheet([]);
      // Ignore header row append by replacing appendRow once for metadata sheets if needed;
      // actually createFakeSheet stores data rows at index 0 -> getLastRow = rows.length + 1.
      // For AgendaDocuments.js, insertSheet calls sheet.appendRow(headers) expecting row 1 = headers!
      const rawRows = [];
      const metaSheet = {
        rows: rawRows,
        getLastRow: () => rawRows.length,
        getLastColumn: () => (rawRows[0] ? rawRows[0].length : 3),
        appendRow: row => rawRows.push(Array.from(row)),
        getRange: (r, c, n = 1, w = 1) => ({
          getValues: () => rawRows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w)),
          setValues: values => values.forEach((vals, i) => {
            const idx = r - 1 + i;
            while (rawRows.length <= idx) rawRows.push([]);
            vals.forEach((v, j) => { rawRows[idx][c - 1 + j] = v; });
          }),
          setValue: val => {
            const idx = r - 1;
            while (rawRows.length <= idx) rawRows.push([]);
            rawRows[idx][c - 1] = val;
          },
          setNumberFormat() { return this; }
        })
      };
      sheets.set(name, metaSheet);
      return metaSheet;
    }
  };
  // Normalize initialDocs / initialPhotos to 1-based header-included sheets matching AgendaDocuments.js
  if (initialDocs.length) {
    const s = ss.insertSheet('Dokumen_Agenda');
    s.appendRow(['Agenda ID', 'Dokumen JSON', 'Diperbarui']);
    initialDocs.forEach(r => s.appendRow(r));
  }
  if (initialPhotos.length) {
    const s = ss.insertSheet('Foto_Agenda');
    s.appendRow(['Agenda ID', 'Foto JSON', 'Diperbarui']);
    initialPhotos.forEach(r => s.appendRow(r));
  }

  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: () => '2026-11-10 12:00:00',
      base64Encode: () => 'AQID'
    },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    DriveApp: {
      getFileById: id => ({
        getName: () => `${id}.jpg`,
        getBlob: () => ({
          getContentType: () => 'image/jpeg',
          getBytes: () => [1, 2, 3]
        })
      })
    }
  });

  for (const file of ['MeetingRooms.js', 'VisitWorkflow.js', 'VisitArchive.js', 'Code.js', 'AgendaDocuments.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => ss;
  context.autoSortAllSheets = () => { };
  context.autoSortRapat = () => { };
  context.requireVisitAdmin_ = () => {
    if (!isAdmin) throw new Error('Akun ini belum diberi akses admin.');
  };
  context.saveVisitWorkflowFile_ = (file, code, kind) => {
    driveWrites.push({ file, code, kind });
    return { name: file.name, url: `https://drive.google.com/file/d/${kind}-${driveWrites.length}/view`, mime: kind === 'foto-rapat' ? 'image/jpeg' : 'application/pdf' };
  };
  return { context, sheets, driveWrites };
}

test('Admin HTML moves Upload Foto and Upload Notula into Edit Rapat and removes redundant upload dialog', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });

  assert.doesNotMatch(html, /id="meetingPhotosModal"/, 'standalone photo modal outside Edit must be removed');
  assert.doesNotMatch(html, /function openMeetingPhotos\b/, 'openMeetingPhotos launcher must be removed');

  const modalHtml = html.match(/<div id="modalJadwalRapat"[\s\S]*?<div id="toastContainer"/)?.[0] || '';
  assert.ok(modalHtml, 'modalJadwalRapat must exist');
  assert.match(modalHtml, /id="meetingEditAttachments"/);
  assert.match(modalHtml, /id="meetingEditPhotoList"/);
  assert.match(modalHtml, /id="meetingPhotoFiles"/);
  assert.match(modalHtml, /id="meetingPhotoCamera"/);
  assert.match(modalHtml, /id="meetingEditNotulaInfo"/);
  assert.match(modalHtml, /id="meetingEditNotulaFile"/);
  assert.match(modalHtml, /id="btnUploadEditNotula"/);
  assert.match(modalHtml, /id="btnLockRapatInEdit"/);
  assert.match(modalHtml, /id="btnCancelMeeting"/);
  assert.match(modalHtml, /id="meetingEditLockBanner"/);

  const formHtml = html.match(/<form id="formJadwalRapat"[\s\S]*?<\/form>/)?.[0] || '';
  const namedFields = [...formHtml.matchAll(/\bname="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(namedFields, ['judul', 'ruangan', 'tanggal', 'jam_mulai', 'jam_selesai', 'bidang', 'pimpinan', 'agenda']);

  assert.match(html, /<dialog id="confirmLockRapatModal"[\s\S]*?Konfirmasi – Kunci[\s\S]*?<\/dialog>/);
  assert.match(html, /<dialog id="confirmCancelRapatModal"[\s\S]*?Batalkan[\s\S]*?<\/dialog>/);
  assert.match(html, /<dialog id="agendaAttendanceModal"[\s\S]*?<tbody id="agendaAttendanceRows"[\s\S]*?agendaAttendanceManualBtn[\s\S]*?Presensi Manual[\s\S]*?<\/dialog>/);
});

test('all meeting cards consolidate attendance into Presensi, remove card lock button, and turn locked Edit into grey Terkunci', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const containers = {};
  const context = vm.createContext({
    MEETING_ROOMS: rooms,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-26T05:00:00Z'])); } },
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    document: { getElementById: id => containers[id] ||= { innerHTML: '' } },
    filterAgendaRecords_: require('../agenda-search').filter
  });
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  for (const fn of ['isMeetingLocked', 'getMeetingRoomInfo', 'renderMeetingRoomBadge', 'formatMeetingDate', 'isMeetingOverdue', 'meetingStatusInfo', 'canAdminRecordAttendance', 'renderMeetingsList']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  const unlockedInternal = { id: 1, kode_rapat: 'RPT-1', judul_rapat: 'Rapat Internal 1', nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-10-25', jam_mulai: '09:00', jam_selesai: '10:00', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'Adrial', status: 'Terjadwal', photos: [] };
  const lockedInternal = { ...unlockedInternal, id: 2, kode_rapat: 'RPT-2', judul_rapat: 'Rapat Terkunci', status: 'Terkunci', locked: true, photos: [{ name: 'foto.jpg', url: '/local-doc/1' }], notula: { name: 'notula.pdf', url: '/local-doc/2' } };
  const visitAgenda = { ...unlockedInternal, id: 3, kode_rapat: 'VISIT-TLD-1', kode_kunjungan: 'TLD-1', judul_rapat: 'Kunjungan Tamu' };

  context.renderMeetingsList([unlockedInternal]);
  let cardHtml = containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(cardHtml, /openMeetingPhotos|uploadAgendaNotula|confirmLockMeeting|openManualVisitAttendance|Unggah Foto|Unggah E-notula|Konfirmasi – Kunci|Presensi Manual/);
  assert.match(cardHtml, /onclick="openAgendaAttendance[^>]*>[^]*Presensi/);
  assert.match(cardHtml, /bukaModalEditRapat[^>]*>[^]*Edit Rapat/);

  context.renderMeetingsList([{ ...unlockedInternal, status: 'Selesai', notula: { name: 'notula.pdf', url: '/local-doc/2' } }]);
  cardHtml = containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(cardHtml, /openMeetingPhotos|uploadAgendaNotula|confirmLockMeeting|Unggah Foto|Unggah E-notula|Lihat E-Notula|Konfirmasi – Kunci/);
  assert.match(cardHtml, /bukaModalEditRapat[^>]*>[^]*Edit Rapat/);

  context.renderMeetingsList([lockedInternal]);
  cardHtml = containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(cardHtml, /openMeetingPhotos|uploadAgendaNotula|confirmLockMeeting|Unggah Foto|Unggah E-notula|Lihat E-Notula|Lihat Rapat|Edit Rapat/);
  const lockedEditBtn = cardHtml.match(/<button[^>]*onclick="bukaModalEditRapat[^]*?<\/button>/)[0];
  assert.match(lockedEditBtn, /bg-slate-200/);
  assert.match(lockedEditBtn, /Terkunci/);

  context.renderMeetingsList([visitAgenda]);
  cardHtml = containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(cardHtml, /openMeetingPhotos|uploadAgendaNotula|confirmLockMeeting|openManualVisitAttendance|Unggah Foto|Unggah E-notula|Lihat E-Notula|Konfirmasi – Kunci|Presensi Manual/);
  assert.match(cardHtml, /onclick="openAgendaAttendance[^>]*>[^]*Presensi/);
  assert.match(cardHtml, /bukaModalEditRapat[^>]*>[^]*Edit Rapat/);

  context.renderMeetingsList([{ ...visitAgenda, status: 'Terkunci', locked: true, notula: { name: 'n.pdf', url: '/local-doc/9' } }]);
  cardHtml = containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(cardHtml, /confirmLockMeeting|uploadAgendaNotula|Lihat E-Notula|Lihat Rapat|Edit Rapat/);
  const lockedVisitBtn = cardHtml.match(/<button[^>]*onclick="bukaModalEditRapat[^]*?<\/button>/)[0];
  assert.match(lockedVisitBtn, /bg-slate-200/);
  assert.match(lockedVisitBtn, /Terkunci/);
});

test('Edit Rapat modal enforces read-only view when locked while keeping photo/notula viewing and downloading available', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });

  function makeSelect() {
    const options = [];
    let val = '';
    return {
      disabled: false,
      get options() { return options; },
      get value() { return val; },
      set value(v) { val = options.some(o => o.value === String(v)) ? String(v) : ''; },
      replaceChildren(...nodes) { options.splice(0, options.length, ...nodes); val = options[0] ? options[0].value : ''; },
      add(opt) { options.push(opt); }
    };
  }
  const fields = {
    judul: { value: '', readOnly: false, disabled: false },
    ruangan: makeSelect(),
    tanggal: { value: '', readOnly: false, disabled: false },
    jam_mulai: { value: '', readOnly: false, disabled: false },
    jam_selesai: { value: '', readOnly: false, disabled: false },
    bidang: makeSelect(),
    pimpinan: { value: '', readOnly: false, disabled: false },
    agenda: { value: '', readOnly: false, disabled: false }
  };
  const elements = {
    modalJadwalRapat: { classes: new Set(['hidden']), classList: { add: (...a) => a.forEach(c => elements.modalJadwalRapat.classes.add(c)), remove: (...a) => a.forEach(c => elements.modalJadwalRapat.classes.delete(c)) } },
    formJadwalRapat: {
      reset() { Object.values(fields).forEach(f => { f.value = ''; }); },
      querySelectorAll: () => Object.values(fields),
      elements: fields
    },
    rapatSelectRuangan: fields.ruangan,
    rapatSelectBidang: fields.bidang,
    rapatInputPimpinan: fields.pimpinan,
    modalRapatPill: { textContent: '' },
    modalRapatTitle: { textContent: '' },
    btnSubmitRapat: { hidden: false, disabled: false, innerHTML: 'Jadwalkan' },
    btnCancelRapat: { textContent: 'Batal' },
    meetingEditLockBanner: { hidden: true },
    meetingEditAttachments: { hidden: true },
    meetingEditPhotoList: { innerHTML: '' },
    meetingEditPhotoUpload: { hidden: false, querySelectorAll: () => [] },
    meetingPhotoProgress: { textContent: '' },
    meetingEditNotulaInfo: { innerHTML: '' },
    meetingEditNotulaUpload: { hidden: false },
    btnUploadEditNotula: { disabled: false, innerHTML: '' },
    meetingNotulaProgress: { textContent: '' },
    meetingEditLockSection: { hidden: true },
    meetingEditCancelSection: { hidden: true },
    meetingEditPhotoSection: { hidden: false },
    meetingEditPhotoHeadingText: { textContent: '' },
    meetingEditPhotoHint: { textContent: '' }
  };

  const unlockedMeeting = {
    id: 10,
    kode_rapat: 'RPT-10',
    judul_rapat: 'Rapat Lama',
    ruangan_id: 6001,
    nama_ruangan: 'Ruang Rapat Utama Diskum',
    tanggal: '2026-10-25',
    jam_mulai: '09:00',
    jam_selesai: '10:00',
    penyelenggara_bidang: 'Sekretariat / Umpeg',
    pimpinan_rapat: 'Pimpinan Legacy',
    agenda: 'Bahasan legacy',
    status: 'Selesai',
    photos: [{ name: 'doc.jpg', url: '/local-doc/1' }],
    notula: { name: 'notula.pdf', url: '/local-doc/2' }
  };
  const lockedMeeting = { ...unlockedMeeting, id: 11, status: 'Terkunci', locked: true };
  const visitMeeting = { ...unlockedMeeting, id: 12, kode_rapat: 'VISIT-TLD-12', kode_kunjungan: 'TLD-12', status: 'Terjadwal', photos: [], notula: null };

  function FakeOption(text = '', value = text) {
    return { text: String(text), value: String(value) };
  }
  const context = vm.createContext({
    Option: FakeOption,
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    allRapatData: [unlockedMeeting, lockedMeeting, visitMeeting],
    editingRapatId: null,
    loadMeetingRoomOptions: async () => [{ id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50 }],
    document: {
      getElementById: id => elements[id] || null,
      querySelector: sel => null,
      querySelectorAll: () => []
    },
    showToast() { }
  });
  // Map named field lookups via formJadwalRapat.querySelector or helper
  elements.formJadwalRapat.querySelector = sel => {
    const m = /\[name="([^"]+)"\]/.exec(sel);
    return m ? fields[m[1]] : null;
  };
  vm.runInContext(fs.readFileSync('Admin/RapatPimpinan.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync('Admin/MeetingPhotos.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync('Admin/ArchiveClient.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  for (const fn of ['isMeetingLocked', 'bukaModalRapat', 'bukaModalEditRapat', 'tutupModalRapat', 'applyModalRapatMode', 'renderMeetingEditAttachments']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  await context.bukaModalEditRapat(10);
  assert.equal(elements.meetingEditAttachments.hidden, false);
  assert.equal(elements.meetingEditLockBanner.hidden, true);
  assert.equal(elements.btnSubmitRapat.hidden, false);
  assert.equal(elements.meetingEditPhotoUpload.hidden, false);
  assert.equal(elements.meetingEditNotulaUpload.hidden, false);
  assert.equal(elements.meetingEditLockSection.hidden, false);
  assert.equal(elements.meetingEditCancelSection.hidden, false);
  assert.equal(elements.meetingEditPhotoSection.hidden, false);
  assert.equal(elements.meetingEditPhotoHeadingText.textContent, 'Foto Rapat Internal');
  assert.match(elements.meetingEditPhotoHint.textContent, /Wajib minimal 1 foto/);
  assert.equal(fields.bidang.value, 'Sekretariat / Umpeg', 'legacy penyelenggara_bidang preserved');
  assert.equal(fields.pimpinan.value, 'Pimpinan Legacy');
  assert.equal(fields.judul.disabled, false);

  await context.bukaModalEditRapat(11);
  assert.equal(elements.meetingEditAttachments.hidden, false);
  assert.equal(elements.meetingEditLockBanner.hidden, false);
  assert.equal(elements.btnSubmitRapat.hidden, true);
  assert.equal(elements.meetingEditPhotoUpload.hidden, true);
  assert.equal(elements.meetingEditNotulaUpload.hidden, true);
  assert.equal(elements.meetingEditLockSection.hidden, true);
  assert.equal(elements.meetingEditCancelSection.hidden, true);
  assert.equal(fields.judul.disabled, true);
  assert.equal(fields.agenda.disabled, true);
  assert.match(elements.meetingEditPhotoList.innerHTML, /href="\/local-doc\/1"/);
  assert.match(elements.meetingEditPhotoList.innerHTML, /downloadMeetingPhoto/);
  assert.doesNotMatch(elements.meetingEditPhotoList.innerHTML, /downloadMeetingPhoto\([^)]*\)\s*"[^>]*disabled/);
  assert.match(elements.meetingEditNotulaInfo.innerHTML, /href="\/local-doc\/2"/);

  await context.bukaModalEditRapat(12);
  assert.equal(elements.meetingEditAttachments.hidden, false);
  assert.equal(elements.meetingEditPhotoSection.hidden, false, 'VISIT- agenda enables multi-photo section inside Edit Rapat');
  assert.equal(elements.meetingEditPhotoUpload.hidden, false);
  assert.equal(elements.meetingEditPhotoHeadingText.textContent, 'Foto Agenda Kunjungan', 'VISIT- photo section uses distinct label from internal meeting & SPPD');
  assert.match(elements.meetingEditPhotoHint.textContent, /Buku Tamu/);
  assert.equal(elements.btnUploadEditNotula.disabled, false, 'VISIT- meeting enables E-notula inside Edit without requiring Foto_Agenda first');
  assert.equal(elements.meetingEditCancelSection.hidden, false);
});

test('Konfirmasi – Kunci opens confirmation dialog, cancels without mutating, and locks only after confirmation', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const btnConfirm = { disabled: false, innerHTML: 'Konfirmasi – Kunci' };
  const btnCancel = { disabled: false };
  const titleEl = { textContent: '' };
  const rpcCalls = [];
  let renderCount = 0;
  const meeting = { id: 25, kode_rapat: 'RPT-25', judul_rapat: 'Rapat Penguncian', status: 'Terjadwal', locked: false };

  const context = vm.createContext({
    allRapatData: [meeting],
    editingRapatId: null,
    pendingLockRapatId: null,
    lockRapatBusy: false,
    document: {
      getElementById: id => ({
        confirmLockRapatModal: dialog,
        confirmLockRapatTitleText: titleEl,
        btnConfirmLockRapat: btnConfirm,
        btnCancelLockRapat: btnCancel,
        modalJadwalRapat: { classList: { contains: () => true } }
      })[id] || null
    },
    visitRpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      return { ...meeting, status: 'Terkunci', locked: true };
    },
    renderMeetingsList: () => { renderCount++; },
    showToast() { }
  });
  for (const fn of ['isMeetingLocked', 'confirmLockMeeting', 'closeConfirmLockRapat', 'executeConfirmLockRapat']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  context.confirmLockMeeting(25);
  assert.equal(dialog.open, true);
  assert.equal(titleEl.textContent, 'Rapat Penguncian');
  assert.equal(rpcCalls.length, 0);

  context.closeConfirmLockRapat();
  assert.equal(dialog.open, false);
  assert.equal(rpcCalls.length, 0);

  context.confirmLockMeeting(25);
  await context.executeConfirmLockRapat();
  assert.equal(dialog.open, false);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0])), { name: 'lockAgendaRapat', payload: { rapat_id: 25 } });
  assert.equal(context.allRapatData[0].locked, true);
  assert.equal(renderCount, 1);
});

test('Edit Rapat client handlers submit updateJadwalRapat, upload photos/notula inside Edit, and reject locked actions', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const btnSubmit = { disabled: false, innerHTML: 'Simpan Perubahan', hidden: false };
  const btnUploadNotula = { disabled: false, innerHTML: 'Unggah E-notula', title: '' };
  const photoInput = { files: [{ name: 'foto.jpg', type: 'image/jpeg', size: 100 }], value: 'foto.jpg' };
  const notulaInput = { files: [{ name: 'notula.pdf', type: 'application/pdf', size: 100 }], value: 'notula.pdf' };
  const calls = [];
  const toasts = [];
  const meeting = { id: 31, kode_rapat: 'RPT-31', judul_rapat: 'Rapat Edit', status: 'Terjadwal', photos: [] };

  class Reader {
    readAsDataURL(file) {
      this.result = `data:application/octet-stream;base64,${file.type === 'application/pdf' ? 'JVBERg==' : '/9j/2Q=='}`;
      this.onload();
    }
  }

  const context = vm.createContext({
    FileReader: Reader,
    FormData: class { entries() { return Object.entries(completeMeetingPayload({ judul: 'Judul Baru' })); } },
    escapeHtml: value => String(value ?? ''),
    allRapatData: [meeting],
    editingRapatId: 31,
    meetingPhotosBusy: false,
    meetingNotulaBusy: false,
    document: {
      getElementById: id => ({
        btnSubmitRapat: btnSubmit,
        btnUploadEditNotula: btnUploadNotula,
        meetingEditAttachments: { hidden: false },
        meetingEditPhotoList: { innerHTML: '' },
        meetingEditPhotoUpload: { hidden: false, querySelectorAll: () => [] },
        meetingPhotoProgress: { textContent: '' },
        meetingEditNotulaInfo: { innerHTML: '' },
        meetingEditNotulaUpload: { hidden: false },
        meetingNotulaProgress: { textContent: '' },
        meetingEditLockSection: { hidden: false },
        modalJadwalRapat: { classList: { add() { }, remove() { } } },
        formJadwalRapat: { reset() { } }
      })[id] || null
    },
    callBackend: (name, args, success) => {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      success({ success: true, message: 'Data rapat berhasil diperbarui.' });
    },
    visitRpc: async (name, payload) => {
      calls.push({ name, payload: JSON.parse(JSON.stringify(payload)) });
      if (name === 'saveAgendaPhotos') return [{ name: 'foto.jpg', url: '/local-doc/1' }];
      if (name === 'saveAgendaNotula') return { name: 'notula.pdf', url: '/local-doc/2' };
      return null;
    },
    renderMeetingsList() { },
    loadAllDashboard() { },
    switchTab() { },
    resetRapatPimpinanAutoFill() { },
    applyModalRapatMode() { },
    responseMessage: (res, fb) => res?.message || fb,
    showToast: (type, title, msg) => toasts.push({ type, title, msg })
  });

  vm.runInContext(fs.readFileSync('Admin/VisitModal.html', 'utf8').match(/  function visitFileMime\([^]*?\n  \}/)[0], context);
  vm.runInContext(fs.readFileSync('Admin/MeetingPhotos.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync('Admin/ArchiveClient.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  for (const fn of ['isMeetingLocked', 'renderMeetingEditAttachments', 'tutupModalRapat', 'submitJadwalRapat']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  // Upload Foto inside Edit
  await context.saveMeetingPhotos(photoInput);
  assert.equal(calls[0].name, 'saveAgendaPhotos');
  assert.equal(calls[0].payload.rapat_id, 31);
  assert.equal(meeting.photos.length, 1);

  // Upload Notula inside Edit
  await context.saveMeetingEditNotula(notulaInput);
  assert.equal(calls[1].name, 'saveAgendaNotula');
  assert.equal(calls[1].payload.rapat_id, 31);
  assert.equal(meeting.status, 'Selesai');

  // Edit meeting fields
  context.editingRapatId = 31;
  context.submitJadwalRapat({ preventDefault() { }, target: { reportValidity: () => true } });
  assert.equal(calls[2].name, 'updateJadwalRapat');
  assert.equal(calls[2].args[0].rapat_id, 31);
  assert.equal(calls[2].args[0].judul, 'Judul Baru');

  // Locked meeting blocks client-side submit & uploads
  meeting.locked = true;
  meeting.status = 'Terkunci';
  context.editingRapatId = 31;
  await context.saveMeetingPhotos({ files: [{ name: 'foto2.jpg', type: 'image/jpeg', size: 100 }], value: 'foto2.jpg' });
  await context.saveMeetingEditNotula({ files: [{ name: 'notula2.pdf', type: 'application/pdf', size: 100 }], value: 'notula2.pdf' });
  context.submitJadwalRapat({ preventDefault() { }, target: { reportValidity: () => true } });
  assert.equal(calls.length, 3, 'locked state blocks client-side edits and uploads');
});

test('attendance availability closes public QR when meeting is locked without E-notula', () => {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync('Admin/MeetingRooms.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], c);
  const now = new Date('2026-10-26T02:00:00Z');
  const openMeeting = { tanggal: '2026-10-26', jam_mulai: '08:00', jam_selesai: '12:00', status: 'Terjadwal', locked: false };
  const lockedMeeting = { ...openMeeting, status: 'Terkunci', locked: true };
  assert.equal(c.attendanceAvailability_(openMeeting, now).open, true);
  assert.equal(c.attendanceAvailability(openMeeting, now).open, true);
  assert.equal(c.attendanceAvailability_(lockedMeeting, now).open, false);
  assert.equal(c.attendanceAvailability(lockedMeeting, now).open, false);
});

test('GAS backend supports editing unlocked meetings, uploading attachments before lock, locking, and blocking edits server-side', () => {
  const { context, sheets, driveWrites } = createGasHarness();
  const payload = completeMeetingPayload({
    ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-15',
    jam_mulai: '09:00',
    jam_selesai: '10:30'
  });
  assert.equal(context.simpanJadwalRapat(payload).success, true);
  assert.equal(context.simpanJadwalRapat({ ...payload, judul: 'Rapat Kedua', jam_mulai: '13:00', jam_selesai: '14:30' }).success, true);

  const created = context.getRapatCalendar().data.find(m => m.judul_rapat === payload.judul);
  assert.ok(created);
  assert.equal(created.locked, false);

  // Self-edit allowed; overlapping another meeting rejected
  assert.equal(context.updateJadwalRapat({ ...payload, rapat_id: created.id, judul: 'Rapat Diperbarui', jam_selesai: '11:00' }).success, true);
  assert.equal(context.updateJadwalRapat({ ...payload, rapat_id: created.id, jam_mulai: '13:30', jam_selesai: '14:00' }).success, false);
  assert.equal(context.getRapatCalendar().data.find(m => m.id === created.id).judul_rapat, 'Rapat Diperbarui');

  // Upload photo -> upload notula -> STILL unlocked (can add photo & replace notula) until locked
  assert.equal(context.saveAgendaPhotos({ rapat_id: created.id, files: [{ name: 'foto1.jpg', data: IMAGE_DATA }] }).success, true);
  assert.equal(context.saveAgendaNotula({ rapat_id: created.id, file: { name: 'notula1.pdf', data: PDF_DATA } }).success, true);
  assert.equal(context.getRapatCalendar().data.find(m => m.id === created.id).locked, false);
  assert.equal(context.saveAgendaPhotos({ rapat_id: created.id, files: [{ name: 'foto2.jpg', data: IMAGE_DATA }] }).success, true);
  assert.equal(context.saveAgendaNotula({ rapat_id: created.id, file: { name: 'notula2.pdf', data: PDF_DATA } }).success, true);
  assert.equal(context.updateJadwalRapat({ ...payload, rapat_id: created.id, judul: 'Rapat Sebelum Kunci' }).success, true);

  // Lock via Konfirmasi – Kunci
  const lockRes = context.lockAgendaRapat({ rapat_id: created.id });
  assert.equal(lockRes.success, true, lockRes.error);
  assert.equal(sheets.get('Data_Rapat').rows[0][12], 'Terkunci');
  assert.equal(sheets.get('Data_Rapat').rows[0].length, 14, 'reuses 14-column Data_Rapat schema');
  assert.equal(context.getRapatCalendar().data.find(m => m.id === created.id).locked, true);

  // Server-side lock enforcement blocks edits, uploads, and double-locking
  const writeCountBefore = driveWrites.length;
  assert.equal(context.updateJadwalRapat({ ...payload, rapat_id: created.id, judul: 'Bypass Edit' }).success, false);
  assert.equal(context.saveAgendaPhotos({ rapat_id: created.id, files: [{ name: 'foto3.jpg', data: IMAGE_DATA }] }).success, false);
  assert.equal(context.saveAgendaNotula({ rapat_id: created.id, file: { name: 'notula3.pdf', data: PDF_DATA } }).success, false);
  assert.equal(context.lockAgendaRapat({ rapat_id: created.id }).success, false);
  assert.equal(driveWrites.length, writeCountBefore, 'no Drive writes on blocked locked uploads');
  assert.equal(context.getRapatCalendar().data.find(m => m.id === created.id).judul_rapat, 'Rapat Sebelum Kunci');

  // Viewing/downloading remains available
  const downloadRes = context.getAgendaPhotoDocument({ rapat_id: created.id, index: 0 });
  assert.equal(downloadRes.success, true, downloadRes.error);
  assert.equal(downloadRes.data.name, 'foto1.jpg');
});

test('GAS backend preserves legacy records (unlocked by default) and requires admin auth for edit/lock', () => {
  const legacyRows = [
    [1, 'RPT-20261102-001', 'Rapat Legacy Selesai', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '09:00', '10:00', 'Sekretariat / Umpeg', 'Pimpinan Lama', 5, 'Agenda lama', 'Selesai', '2026-11-02 08:00:00'],
    [2, 'RPT-20261103-002', 'Rapat Legacy Terjadwal', 1, 'Ruang Rapat Utama Diskum', '2026-11-03', '09:00', '10:00', 'Koperasi', 'Pimpinan Lama 2', 3, 'Agenda lama 2', 'Terjadwal', '2026-11-03 08:00:00']
  ];
  const docs = [[1, JSON.stringify({ name: 'legacy-notula.pdf', url: 'https://drive.google.com/file/d/legacy-doc/view' }), '2026-11-02T10:00:00Z']];
  const photos = [[1, JSON.stringify([{ name: 'legacy-foto.jpg', url: 'https://drive.google.com/file/d/legacy-photo/view' }]), '2026-11-02T09:30:00Z']];

  const unauth = createGasHarness({ initialMeetings: legacyRows, initialDocs: docs, initialPhotos: photos, isAdmin: false });
  assert.equal(unauth.context.updateJadwalRapat({ rapat_id: 1, judul: 'X', ruangan: '1|Ruang', tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '10:00', bidang: 'Dinas', pimpinan: 'A', agenda: 'B' }).success, false);
  assert.equal(unauth.context.lockAgendaRapat({ rapat_id: 1 }).success, false);

  const auth = createGasHarness({ initialMeetings: legacyRows, initialDocs: docs, initialPhotos: photos, isAdmin: true });
  const list = auth.context.getRapatCalendar().data;
  assert.equal(list[0].locked, false, 'legacy Selesai record is unlocked by default');
  assert.equal(list[1].locked, false, 'legacy Terjadwal record is unlocked by default');

  assert.equal(auth.context.updateJadwalRapat({
    rapat_id: 1,
    judul: 'Rapat Legacy Diedit',
    ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-02',
    jam_mulai: '09:00',
    jam_selesai: '10:30',
    bidang: 'Sekretariat / Umpeg',
    pimpinan: 'Pimpinan Lama',
    agenda: 'Agenda diperbarui'
  }).success, true);
  assert.equal(auth.context.saveAgendaPhotos({ rapat_id: 1, files: [{ name: 'extra.jpg', data: IMAGE_DATA }] }).success, true);
  assert.equal(auth.context.lockAgendaRapat({ rapat_id: 1 }).success, true);
  assert.equal(auth.context.getRapatCalendar().data.find(m => m.id === 1).locked, true);
  assert.equal(auth.context.updateJadwalRapat({
    rapat_id: 1,
    judul: 'Blocked',
    ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-02',
    jam_mulai: '09:00',
    jam_selesai: '10:30',
    bidang: 'Sekretariat / Umpeg',
    pimpinan: 'Pimpinan Lama',
    agenda: 'Blocked'
  }).success, false);
});

test('local HTTP server enforces edit, pre-lock uploads, Konfirmasi – Kunci, blocked edits, and legacy default unlocked state', async () => {
  const server = createLocalTestServer({
    now: () => new Date('2026-11-05T05:00:00Z'),
    seed({ visitors, meetings, visitWorkflow, rooms }) {
      meetings.push({
        id: 101, kode_rapat: 'RPT-20261102-101', judul_rapat: 'Rapat Legacy Selesai', ruangan_id: rooms[0].id, nama_ruangan: rooms[0].nama_ruangan,
        tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '10:00', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'Adrial, S.K.M, M.K.M.',
        jumlah_peserta: 5, agenda: 'Agenda selesai', status: 'Selesai', photos: []
      });
      const visit1 = {
        id: 1, kode_kunjungan: 'TLD-03112026-001', tipe_tamu: 'luar_daerah', instansi: 'Dinas Koperasi Uji 1',
        alamat: 'Batam', jumlah_orang: 2, ketua_nama: 'Ketua Uji 1', pengikut_list: 'Anggota Uji 1',
        tujuan_bidang: 'Sekretariat', keperluan: 'Koordinasi 1', narahubung_hp: '081200000001',
        tanggal_kunjungan: '2026-11-03', jam_kunjungan: '09:00', lo_id: '', lo_nama: 'PIC 1',
        bawa_sppd: true, status_kunjungan: 'Menunggu Kedatangan'
      };
      const booking1 = {
        id: 102, kode_rapat: 'VISIT-' + visit1.kode_kunjungan, judul_rapat: 'Kunjungan ' + visit1.instansi, ruangan_id: rooms[0].id, nama_ruangan: rooms[0].nama_ruangan,
        tanggal: '2026-11-03', jam_mulai: '09:00', jam_selesai: '10:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'PIC 1',
        jumlah_peserta: 2, agenda: 'Koordinasi 1', status: 'Terjadwal', kode_kunjungan: visit1.kode_kunjungan, photos: []
      };
      const visit2 = {
        id: 2, kode_kunjungan: 'TLD-04112026-002', tipe_tamu: 'luar_daerah', instansi: 'Dinas Koperasi Uji 2',
        alamat: 'Batam', jumlah_orang: 2, ketua_nama: 'Ketua Uji 2', pengikut_list: 'Anggota Uji 2',
        tujuan_bidang: 'Sekretariat', keperluan: 'Koordinasi 2', narahubung_hp: '081200000002',
        tanggal_kunjungan: '2026-11-04', jam_kunjungan: '13:00', lo_id: '', lo_nama: 'PIC 2',
        bawa_sppd: true, status_kunjungan: 'Menunggu Kedatangan'
      };
      const booking2 = {
        id: 103, kode_rapat: 'VISIT-' + visit2.kode_kunjungan, judul_rapat: 'Kunjungan ' + visit2.instansi, ruangan_id: rooms[1].id, nama_ruangan: rooms[1].nama_ruangan,
        tanggal: '2026-11-04', jam_mulai: '13:00', jam_selesai: '14:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'PIC 2',
        jumlah_peserta: 2, agenda: 'Koordinasi 2', status: 'Terjadwal', kode_kunjungan: visit2.kode_kunjungan, photos: []
      };
      visitors.push(visit1, visit2);
      meetings.push(booking1, booking2);
      visitWorkflow.seedVisit(visit1, { version: 2, status: 'Menunggu Kedatangan', booking: booking1, destinations: { bidang: 'Sekretariat', pic: 'PIC 1', picIds: '' }, files: {}, history: [] });
      visitWorkflow.seedVisit(visit2, { version: 2, status: 'Menunggu Kedatangan', booking: booking2, destinations: { bidang: 'Sekretariat', pic: 'PIC 2', picIds: '' }, files: {}, history: [] });
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => (await fetch(`${base}/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })).json();

  try {
    const initialCalendar = (await rpc('getRapatCalendar')).data;
    const legacyCompleted = initialCalendar.find(m => !m.kode_kunjungan && m.status === 'Selesai');
    assert.ok(legacyCompleted, 'seeded deployment preview includes a legacy Selesai internal meeting');
    assert.ok(!legacyCompleted.locked, 'legacy Selesai meeting is unlocked by default');

    const roomsList = (await rpc('getMasterData')).data.ruangan;
    const roomValue = `${roomsList[0].id}|${roomsList[0].nama_ruangan}`;
    const createPayload = {
      judul: 'Uji Revisi 03',
      ruangan: roomValue,
      tanggal: '2026-11-20',
      jam_mulai: '09:00',
      jam_selesai: '11:00',
      bidang: 'Sekretariat',
      pimpinan: 'Adrial, S.K.M, M.K.M.',
      agenda: 'Pembahasan revisi'
    };
    assert.equal((await rpc('simpanJadwalRapat', createPayload)).success, true);
    const created = (await rpc('getRapatCalendar')).data.find(m => m.judul_rapat === createPayload.judul);
    assert.ok(created);

    assert.equal((await rpc('updateJadwalRapat', { ...createPayload, rapat_id: created.id, judul: 'Uji Revisi 03 Edited' })).success, true);
    assert.equal((await rpc('saveAgendaPhotos', { rapat_id: created.id, files: [{ name: 'foto.jpg', data: IMAGE_DATA }] })).success, true);
    assert.equal((await rpc('saveAgendaNotula', { rapat_id: created.id, file: { name: 'notula.pdf', data: PDF_DATA } })).success, true);

    // Still unlocked after E-notula: can add photo, replace notula, edit data
    assert.equal((await rpc('saveAgendaPhotos', { rapat_id: created.id, files: [{ name: 'foto2.jpg', data: IMAGE_DATA }] })).success, true);
    assert.equal((await rpc('saveAgendaNotula', { rapat_id: created.id, file: { name: 'notula-rev.pdf', data: PDF_DATA } })).success, true);
    assert.equal((await rpc('updateJadwalRapat', { ...createPayload, rapat_id: created.id, judul: 'Uji Revisi 03 Final' })).success, true);

    // Lock
    const lockRes = await rpc('lockAgendaRapat', { rapat_id: created.id });
    assert.equal(lockRes.success, true, lockRes.error);

    // Blocked after lock
    assert.equal((await rpc('updateJadwalRapat', { ...createPayload, rapat_id: created.id, judul: 'Illegal Edit' })).success, false);
    assert.equal((await rpc('saveAgendaPhotos', { rapat_id: created.id, files: [{ name: 'foto3.jpg', data: IMAGE_DATA }] })).success, false);
    assert.equal((await rpc('saveAgendaNotula', { rapat_id: created.id, file: { name: 'notula3.pdf', data: PDF_DATA } })).success, false);
    assert.equal((await rpc('lockAgendaRapat', { rapat_id: created.id })).success, false);

    // View/download remains available
    const after = (await rpc('getRapatCalendar')).data.find(m => m.id === created.id);
    assert.equal(after.locked, true);
    assert.equal(after.judul_rapat, 'Uji Revisi 03 Final');
    assert.equal(after.photos.length, 2);
    assert.equal(after.notula.name, 'notula-rev.pdf');
    assert.equal((await rpc('getAgendaPhotoDocument', { rapat_id: created.id, index: 1 })).success, true);
    assert.equal((await rpc('getAgendaAttendance', { rapat_id: created.id })).success, true);
    assert.equal((await rpc('cancelAgendaRapat', { rapat_id: created.id })).success, false, 'locked meeting cannot be cancelled');

    // Apply to all: VISIT- agenda supports edit, multi-photo with distinct label, E-notula, cancel, and lock
    const visitMeeting = initialCalendar.find(m => Boolean(m.kode_kunjungan));
    assert.ok(visitMeeting, 'seeded preview includes a VISIT- agenda');
    assert.equal((await rpc('updateJadwalRapat', {
      rapat_id: visitMeeting.id,
      judul: 'Kunjungan Diperbarui',
      ruangan: roomValue,
      tanggal: '2026-11-22',
      jam_mulai: '10:00',
      jam_selesai: '11:30',
      bidang: visitMeeting.penyelenggara_bidang,
      pimpinan: visitMeeting.pimpinan_rapat,
      agenda: visitMeeting.agenda
    })).success, true);
    const visitPhotos = await rpc('saveAgendaPhotos', { rapat_id: visitMeeting.id, files: [{ name: 'kunjungan-1.jpg', data: IMAGE_DATA }, { name: 'kunjungan-2.jpg', data: IMAGE_DATA }] });
    assert.equal(visitPhotos.success, true, visitPhotos.error);
    assert.equal(visitPhotos.data.length, 2);
    assert.equal(visitPhotos.data[0].label, 'Foto Agenda Kunjungan');
    assert.equal((await rpc('getAgendaPhotoDocument', { rapat_id: visitMeeting.id, index: 1 })).success, true);
    assert.equal((await rpc('saveAgendaNotula', { rapat_id: visitMeeting.id, file: { name: 'visit-notula.pdf', data: PDF_DATA } })).success, true);
    assert.equal((await rpc('lockAgendaRapat', { rapat_id: visitMeeting.id })).success, true);
    assert.equal((await rpc('saveAgendaPhotos', { rapat_id: visitMeeting.id, files: [{ name: 'kunjungan-3.jpg', data: IMAGE_DATA }] })).success, false);
    assert.equal((await rpc('getAgendaPhotoDocument', { rapat_id: visitMeeting.id, index: 0 })).success, true);
    assert.equal((await rpc('updateJadwalRapat', { ...createPayload, rapat_id: visitMeeting.id })).success, false);
    assert.equal((await rpc('cancelAgendaRapat', { rapat_id: visitMeeting.id })).success, false);

    // Locked past/active VISIT- agenda must reject manual visit attendance
    const activeVisit = initialCalendar.find(m => Boolean(m.kode_kunjungan) && String(m.id) !== String(visitMeeting.id) && !m.locked && m.tanggal <= '2026-11-05');
    if (activeVisit) {
      assert.equal((await rpc('lockAgendaRapat', { rapat_id: activeVisit.id })).success, true);
      const lockedManualRes = await rpc('submitManualVisitAttendance', { rapat_id: activeVisit.id, member_ids: ['ketua'] });
      assert.equal(lockedManualRes.success, false, 'locked visit agenda blocks manual visit attendance');
      assert.match(lockedManualRes.error, /terkunci/i);
    }

    // Cancel unlocked meeting frees room slot and removes it from calendar
    const cancelPayload = { ...createPayload, judul: 'Rapat Akan Dibatalkan', tanggal: '2026-11-25', jam_mulai: '09:00', jam_selesai: '10:00' };
    assert.equal((await rpc('simpanJadwalRapat', cancelPayload)).success, true);
    const toCancel = (await rpc('getRapatCalendar')).data.find(m => m.judul_rapat === cancelPayload.judul);
    assert.ok(toCancel);
    assert.equal((await rpc('cancelAgendaRapat', { rapat_id: toCancel.id })).success, true);
    assert.equal((await rpc('getRapatCalendar')).data.some(m => m.id === toCancel.id), false);
    assert.equal((await rpc('cancelAgendaRapat', { rapat_id: toCancel.id })).success, false);
    assert.equal((await rpc('simpanJadwalRapat', { ...cancelPayload, judul: 'Slot Pengganti' })).success, true, 'cancelled slot is freed for rebooking');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('GAS backend supports cancelAgendaRapat with admin auth, lock protection, and slot release, plus VISIT- edit/lock', () => {
  const rows = [
    [1, 'VISIT-TLD-001', 'Kunjungan Tamu', 1, 'Ruang Rapat Utama Diskum', '2026-11-18', '09:00', '10:00', 'Sekretariat', 'Pimpinan', 4, 'Koordinasi', 'Terjadwal', '2026-11-10 08:00:00'],
    [2, 'RPT-20261119-001', 'Rapat Batal', 1, 'Ruang Rapat Utama Diskum', '2026-11-19', '09:00', '10:00', 'Sekretariat', 'Pimpinan', 4, 'Internal', 'Terjadwal', '2026-11-10 08:00:00']
  ];
  const unauth = createGasHarness({ initialMeetings: rows, isAdmin: false });
  assert.equal(unauth.context.cancelAgendaRapat({ rapat_id: 2 }).success, false);

  const auth = createGasHarness({ initialMeetings: rows, isAdmin: true });
  // Edit + multi-photo (distinct database label) + lock VISIT- agenda
  assert.equal(auth.context.updateJadwalRapat({
    rapat_id: 1, judul: 'Kunjungan Diubah', ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-18', jam_mulai: '09:00', jam_selesai: '11:00',
    bidang: 'Sekretariat', pimpinan: 'Pimpinan', agenda: 'Koordinasi Baru'
  }).success, true);
  const visitPhotoSave = auth.context.saveAgendaPhotos({ rapat_id: 1, files: [{ name: 'k1.jpg', data: IMAGE_DATA }, { name: 'k2.jpg', data: IMAGE_DATA }] });
  assert.equal(visitPhotoSave.success, true, visitPhotoSave.error);
  assert.equal(visitPhotoSave.data[0].label, 'Foto Agenda Kunjungan');
  assert.equal(auth.context.getAgendaPhotoDocument({ rapat_id: 1, index: 1 }).success, true);
  assert.equal(auth.context.lockAgendaRapat({ rapat_id: 1 }).success, true);
  assert.equal(auth.context.saveAgendaPhotos({ rapat_id: 1, files: [{ name: 'k3.jpg', data: IMAGE_DATA }] }).success, false, 'locked visit agenda blocks photo upload');
  assert.equal(auth.context.cancelAgendaRapat({ rapat_id: 1 }).success, false, 'locked agenda cannot be cancelled');

  // Cancel unlocked agenda frees room and rejects further mutations
  assert.equal(auth.context.cancelAgendaRapat({ rapat_id: 2 }).success, true);
  assert.equal(auth.sheets.get('Data_Rapat').rows[1][12], 'Dibatalkan');
  assert.equal(auth.context.getRapatCalendar().data.some(m => m.id === 2), false);
  assert.equal(auth.context.simpanJadwalRapat({
    judul: 'Pengganti', ruangan: '1|Ruang Rapat Utama Diskum',
    tanggal: '2026-11-19', jam_mulai: '09:00', jam_selesai: '10:00',
    bidang: 'Sekretariat', pimpinan: 'Pimpinan', agenda: 'Pengganti'
  }).success, true);
});

test('Cancel meeting dialog inside Edit Rapat confirms before calling cancelAgendaRapat and cleans up state', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const titleEl = { textContent: '' };
  const btnConfirm = { disabled: false, innerHTML: 'Batalkan Rapat' };
  const btnCancel = { disabled: false };
  const rpcCalls = [];
  let closedEdit = 0;
  let rendered = 0;
  const meeting = { id: 44, kode_rapat: 'RPT-44', judul_rapat: 'Rapat Dibatalkan', status: 'Terjadwal', locked: false };

  const context = vm.createContext({
    allRapatData: [meeting],
    editingRapatId: 44,
    pendingCancelRapatId: null,
    cancelRapatBusy: false,
    document: {
      getElementById: id => ({
        confirmCancelRapatModal: dialog,
        confirmCancelRapatTitleText: titleEl,
        btnConfirmCancelRapat: btnConfirm,
        btnCancelDismissRapat: btnCancel,
        modalJadwalRapat: { classList: { add() { }, remove() { } } },
        formJadwalRapat: { reset() { } }
      })[id] || null
    },
    visitRpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      return { id: 44, status: 'Dibatalkan' };
    },
    renderMeetingsList: () => { rendered++; },
    tutupModalRapat: () => { closedEdit++; },
    loadAllDashboard() { },
    showToast() { }
  });
  for (const fn of ['isMeetingLocked', 'confirmCancelMeeting', 'closeConfirmCancelRapat', 'executeConfirmCancelRapat']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  context.confirmCancelMeeting(44);
  assert.equal(dialog.open, true);
  assert.equal(titleEl.textContent, 'Rapat Dibatalkan');
  assert.equal(rpcCalls.length, 0);

  context.closeConfirmCancelRapat();
  assert.equal(dialog.open, false);
  assert.equal(rpcCalls.length, 0);

  context.confirmCancelMeeting(44);
  await context.executeConfirmCancelRapat();
  assert.equal(dialog.open, false);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0])), { name: 'cancelAgendaRapat', payload: { rapat_id: 44 } });
  assert.equal(context.allRapatData.length, 0);
  assert.equal(closedEdit, 1);
  assert.equal(rendered, 1);
});

test('GAS backend blocks submitManualVisitAttendance when a VISIT- agenda is locked', () => {
  const { context } = createGasHarness({
    initialMeetings: [
      [1, 'VISIT-TLD-001', 'Kunjungan Tamu', 1, 'Ruang Rapat Utama Diskum', '2026-11-02', '09:00', '10:00', 'Sekretariat', 'Pimpinan', 2, 'Koordinasi', 'Terkunci', '2026-11-02 08:00:00']
    ],
    isAdmin: true
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', 'VisitWorkflowStorage.js'), 'utf8'), context);
  context.requireVisitAdmin_ = () => { };
  context.visitAttendanceForAgenda_ = () => ({
    visit: { kode_kunjungan: 'TLD-001', instansi: 'Instansi Uji', ketua_nama: 'Ketua Uji', pengikut_list: 'Anggota Uji' },
    workflow: { status: 'Menunggu Kedatangan', booking: { id: 1 } },
    attendance: []
  });
  context.savePresensiRapat_ = () => ({ success: true });
  context.readVisitWorkflow_ = () => ({});
  const res = context.submitManualVisitAttendance({ rapat_id: 1, member_ids: ['ketua'] });
  assert.equal(res.success, false, 'locked VISIT- agenda must reject manual visit attendance');
  assert.match(res.error, /terkunci/i);

  // Client VisitAttendance.html also blocks direct openManualVisitAttendance on locked agendas
  const fields = { manualVisitAttendance: { hidden: true } };
  let rpcCalled = false;
  const vaCtx = vm.createContext({
    allRapatData: [{ id: 1, kode_kunjungan: 'TLD-001', status: 'Terkunci', locked: true }],
    isMeetingLocked: m => Boolean(m && (m.locked || m.status === 'Terkunci')),
    canAdminRecordAttendance: () => true,
    visitRpc: async () => { rpcCalled = true; return {}; },
    document: { activeElement: {}, addEventListener() {}, body: { style: {} }, getElementById: id => fields[id] || ({ hidden: true }), querySelector: () => ({ focus() {} }) }
  });
  vm.runInContext(fs.readFileSync('Admin/VisitAttendance.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], vaCtx);
  vaCtx.openManualVisitAttendance(1);
  assert.equal(fields.manualVisitAttendance.hidden, true);
  assert.equal(rpcCalled, false);
});
