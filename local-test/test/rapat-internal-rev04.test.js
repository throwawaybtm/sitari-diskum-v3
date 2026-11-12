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

function extractFn(source, name) {
  const match = source.match(new RegExp(`    (?:async\\s+)?function ${name}\\([^]*?\\n    \\}`));
  assert.ok(match, `Expected function ${name} in source`);
  return match[0];
}

function createFakeSheet(initialRows = [], headers = null) {
  const rows = initialRows.map(r => r.slice());
  return {
    rows,
    headers,
    getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
    getLastRow: () => (headers ? rows.length + 1 : rows.length),
    getLastColumn: () => (headers ? headers.length : (rows[0] ? rows[0].length : 14)),
    appendRow: row => rows.push(Array.from(row)),
    getRange: (r, c, n = 1, w = 1) => {
      const offset = headers ? 2 : 1;
      return {
        getValues: () => rows.slice(r - offset, r - offset + n).map(row => row.slice(c - 1, c - 1 + w)),
        getDisplayValues: () => rows.slice(r - offset, r - offset + n).map(row => row.slice(c - 1, c - 1 + w).map(v => String(v ?? ''))),
        setValues: values => values.forEach((vals, i) => {
          const idx = r - offset + i;
          while (rows.length <= idx) rows.push([]);
          vals.forEach((v, j) => { rows[idx][c - 1 + j] = v; });
        }),
        setValue: val => {
          const idx = r - offset;
          while (rows.length <= idx) rows.push([]);
          rows[idx][c - 1] = val;
        },
        setNumberFormat() { return this; }
      };
    }
  };
}

function createGasHarness({ initialMeetings = [], initialDocs = [], initialPhotos = [], initialHistory = [], initialEmployees = [], initialAttendance = [], initialWorkflows = [], isAdmin = true } = {}) {
  const sheets = new Map();
  sheets.set('Data_Rapat', createFakeSheet(initialMeetings, new Array(14).fill('H')));

  const rawSheets = new Map();
  function makeMetaSheet(name, headers, initialRows) {
    const rawRows = [headers.slice(), ...initialRows.map(r => r.slice())];
    const metaSheet = {
      rows: rawRows,
      getLastRow: () => rawRows.length,
      getLastColumn: () => (rawRows[0] ? rawRows[0].length : headers.length),
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
    rawSheets.set(name, metaSheet);
    sheets.set(name, metaSheet);
    return metaSheet;
  }

  if (initialDocs.length) makeMetaSheet('Dokumen_Agenda', ['Agenda ID', 'Dokumen JSON', 'Diperbarui'], initialDocs);
  if (initialPhotos.length) makeMetaSheet('Foto_Agenda', ['Agenda ID', 'Foto JSON', 'Diperbarui'], initialPhotos);
  if (initialHistory.length) makeMetaSheet('Riwayat_Agenda', ['Agenda ID', 'Riwayat JSON', 'Diperbarui'], initialHistory);
  if (initialEmployees.length) makeMetaSheet('Master_Pegawai', ['ID', 'NIP', 'Nama Pegawai', 'Jabatan', 'Bidang', 'Is_LO', 'Workload_Count', 'Status_Aktif', 'Pangkat / Golongan'], initialEmployees);
  if (initialAttendance.length) makeMetaSheet('Data_Presensi', ['ID', 'Rapat_ID', 'Judul_Rapat', 'Kategori_Peserta', 'Nama_Peserta', 'NIP', 'Jabatan', 'Nama_OPD_Bidang', 'No_HP', 'Waktu_Hadir', 'Anggota Kunjungan ID', 'Sumber Presensi', 'Waktu Pencatatan'], initialAttendance);
  if (initialWorkflows.length) makeMetaSheet('Alur_Kunjungan', ['Kode Kunjungan', 'Versi', 'Data Alur JSON', 'Diperbarui'], initialWorkflows);

  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
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

  let authReads = 0;
  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: (date, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd HH:mm:ss') return '2026-11-11 08:00:00';
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone: tz || 'Asia/Jakarta',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(date);
      },
      base64Encode: () => 'AQID'
    },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }
  });

  for (const file of ['MeetingRooms.js', 'VisitWorkflow.js', 'VisitArchive.js', 'EmployeeDirectory.js', 'Code.js', 'AgendaDocuments.js', 'AgendaAttendanceData.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => {
    authReads++;
    return ss;
  };
  context.autoSortAllSheets = () => { };
  context.autoSortRapat = () => { };
  context.requireVisitAdmin_ = () => {
    if (!isAdmin) throw new Error('Akun ini belum diberi akses admin.');
  };
  context.getApprovalActor_ = () => 'admin@diskum.batam.go.id';
  context.saveVisitWorkflowFile_ = (file, code, kind) => ({
    name: file.name,
    url: `https://drive.google.com/file/d/${kind}-1/view`,
    mime: kind === 'foto-rapat' ? 'image/jpeg' : 'application/pdf'
  });

  return { context, sheets, getSpreadsheetCalls: () => authReads };
}

test('Edit Rapat modal adds only Tunda Rapat and Jadwalkan Ulang actions, preserves existing actions, and omits Selesai/Unlock buttons', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const modalHtml = html.match(/<div id="modalJadwalRapat"[\s\S]*?<div id="toastContainer"/)?.[0] || '';
  assert.ok(modalHtml, 'modalJadwalRapat must exist');

  // Keep existing 8-field form intact
  const formHtml = html.match(/<form id="formJadwalRapat"[\s\S]*?<\/form>/)?.[0] || '';
  const namedFields = [...formHtml.matchAll(/\bname="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(namedFields, ['judul', 'ruangan', 'tanggal', 'jam_mulai', 'jam_selesai', 'bidang', 'pimpinan', 'agenda']);

  // Existing actions preserved
  assert.match(modalHtml, /id="btnCancelRapat"/);
  assert.match(modalHtml, /id="btnSubmitRapat"/);
  assert.match(modalHtml, /id="meetingPhotoFiles"/);
  assert.match(modalHtml, /id="btnUploadEditNotula"/);
  assert.match(modalHtml, /id="btnLockRapatInEdit"/);
  assert.match(modalHtml, /id="btnCancelMeeting"/);

  // Exactly two new actions in Edit Rapat: Tunda Rapat & Jadwalkan Ulang
  assert.match(modalHtml, /id="btnPostponeMeeting"[^>]*>[\s\S]*?Tunda Rapat/);
  assert.match(modalHtml, /id="btnRescheduleMeeting"[^>]*>[\s\S]*?Jadwalkan Ulang/);
  assert.match(modalHtml, /id="meetingEditHistorySection"/);

  // Compact multi-column attachments & action bar structure
  assert.match(modalHtml, /id="meetingEditAttachments"[\s\S]*grid grid-cols-1 sm:grid-cols-2[\s\S]*id="meetingEditPhotoSection"[\s\S]*E-Notula/);
  assert.match(modalHtml, /id="meetingEditActionsGrid"[^>]*grid grid-cols-2 sm:grid-cols-4/);

  // No separate Selesai or Unlock status buttons added inside modalJadwalRapat
  const modalButtons = [...modalHtml.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.equal(modalButtons.some(label => /\bSelesai\b/i.test(label)), false, 'must not add separate Selesai button');
  assert.equal(modalButtons.some(label => /\b(?:Unlock|Buka Kunci)\b/i.test(label)), false, 'must not add Unlock button');

  // Dialogs for Tunda Rapat and Jadwalkan Ulang
  assert.match(html, /<dialog id="confirmPostponeRapatModal"[\s\S]*?Tunda Rapat[\s\S]*?<\/dialog>/);
  const rescheduleDialog = html.match(/<dialog id="rescheduleRapatModal"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.ok(rescheduleDialog, 'rescheduleRapatModal must exist');
  assert.match(rescheduleDialog, /id="rescheduleTanggal"[^>]*required/);
  assert.match(rescheduleDialog, /id="rescheduleJamMulai"[^>]*required/);
  assert.match(rescheduleDialog, /id="rescheduleJamSelesai"[^>]*required/);
});

test('Edit Rapat modal handles Ditunda state, hides/disables invalid transitions, and preserves read-only history when locked', async () => {
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
    judul: { value: '', disabled: false },
    ruangan: makeSelect(),
    tanggal: { value: '', disabled: false },
    jam_mulai: { value: '', disabled: false },
    jam_selesai: { value: '', disabled: false },
    bidang: makeSelect(),
    pimpinan: { value: '', disabled: false },
    agenda: { value: '', disabled: false }
  };
  const elements = {
    modalJadwalRapat: { classes: new Set(['hidden']), classList: { add: (...a) => a.forEach(c => elements.modalJadwalRapat.classes.add(c)), remove: (...a) => a.forEach(c => elements.modalJadwalRapat.classes.delete(c)) } },
    formJadwalRapat: {
      reset() { Object.values(fields).forEach(f => { f.value = ''; }); },
      querySelectorAll: () => Object.values(fields),
      querySelector: sel => { const m = /\[name="([^"]+)"\]/.exec(sel); return m ? fields[m[1]] : null; }
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
    meetingEditPostponeSection: { hidden: true },
    meetingEditRescheduleSection: { hidden: true },
    meetingEditHistorySection: { hidden: true },
    meetingEditHistoryList: { innerHTML: '' },
    meetingEditPhotoSection: { hidden: false },
    meetingEditPhotoHeadingText: { textContent: '' },
    meetingEditPhotoHint: { textContent: '' }
  };

  const historyEntry = { tanggal: '2026-11-10', jam_mulai: '09:00', jam_selesai: '10:30', nama_ruangan: 'Ruang Rapat Utama Diskum' };
  const scheduledMeeting = { id: 1, kode_rapat: 'RPT-1', judul_rapat: 'Rapat Terjadwal', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-12', jam_mulai: '09:00', jam_selesai: '10:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'Adrial', agenda: 'Agenda', status: 'Terjadwal', photos: [], schedule_history: [] };
  const postponedMeeting = { ...scheduledMeeting, id: 2, status: 'Ditunda', schedule_history: [historyEntry] };
  const completedMeeting = { ...scheduledMeeting, id: 3, status: 'Selesai', photos: [{ name: 'f.jpg', url: '/local-doc/1' }], notula: { name: 'n.pdf', url: '/local-doc/2' } };
  const lockedMeeting = { ...completedMeeting, id: 4, status: 'Terkunci', locked: true, schedule_history: [historyEntry] };

  function FakeOption(text = '', value = text) {
    return { text: String(text), value: String(value) };
  }
  const context = vm.createContext({
    Option: FakeOption,
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    allRapatData: [scheduledMeeting, postponedMeeting, completedMeeting, lockedMeeting],
    editingRapatId: null,
    loadMeetingRoomOptions: async () => [{ id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', kapasitas: 50 }],
    document: { getElementById: id => elements[id] || null },
    showToast() { }
  });
  vm.runInContext(fs.readFileSync('Admin/RapatPimpinan.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync('Admin/MeetingPhotos.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync('Admin/ArchiveClient.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], context);
  for (const fn of ['isMeetingLocked', 'formatMeetingDate', 'bukaModalEditRapat', 'applyModalRapatMode', 'renderMeetingEditAttachments']) {
    vm.runInContext(extractFn(html, fn), context);
  }

  // Terjadwal: both Tunda Rapat and Jadwalkan Ulang visible
  await context.bukaModalEditRapat(1);
  assert.equal(elements.meetingEditPostponeSection.hidden, false);
  assert.equal(elements.meetingEditRescheduleSection.hidden, false);
  assert.equal(elements.meetingEditHistorySection.hidden, true);

  // Ditunda: Tunda Rapat, Photo upload, Notula upload, Lock hidden; Jadwalkan Ulang & Cancel visible; history visible
  await context.bukaModalEditRapat(2);
  assert.equal(elements.meetingEditPostponeSection.hidden, true);
  assert.equal(elements.meetingEditRescheduleSection.hidden, false);
  assert.equal(elements.meetingEditCancelSection.hidden, false);
  assert.equal(elements.meetingEditLockSection.hidden, true);
  assert.equal(elements.meetingEditPhotoUpload.hidden, true);
  assert.equal(elements.meetingEditNotulaUpload.hidden, true);
  assert.equal(elements.meetingEditHistorySection.hidden, false);
  assert.match(elements.meetingEditHistoryList.innerHTML, /10-11-2026/);
  assert.match(elements.meetingEditHistoryList.innerHTML, /09:00 - 10:30/);

  // Selesai (unlocked): Tunda Rapat and Jadwalkan Ulang hidden; Lock & Notula remain available
  await context.bukaModalEditRapat(3);
  assert.equal(elements.meetingEditPostponeSection.hidden, true);
  assert.equal(elements.meetingEditRescheduleSection.hidden, true);
  assert.equal(elements.meetingEditLockSection.hidden, false);

  // Terkunci (locked): Tunda Rapat & Jadwalkan Ulang hidden, history stays visible read-only
  await context.bukaModalEditRapat(4);
  assert.equal(elements.meetingEditPostponeSection.hidden, true);
  assert.equal(elements.meetingEditRescheduleSection.hidden, true);
  assert.equal(elements.meetingEditHistorySection.hidden, false);
});

test('Tunda Rapat and Jadwalkan Ulang client dialogs confirm before calling RPC and update state', async () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const postponeDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const rescheduleDialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const tanggalInput = { value: '' };
  const jamMulaiInput = { value: '' };
  const jamSelesaiInput = { value: '' };
  const formFields = {
    tanggal: { value: '2026-11-15' },
    jam_mulai: { value: '09:00' },
    jam_selesai: { value: '10:00' }
  };
  const rpcCalls = [];
  let renderCount = 0;
  let applyModeCalls = 0;

  const meeting = {
    id: 55,
    kode_rapat: 'RPT-55',
    judul_rapat: 'Rapat Uji Rev04',
    nama_ruangan: 'Ruang Rapat Utama Diskum',
    tanggal: '2026-11-15',
    jam_mulai: '09:00',
    jam_selesai: '10:00',
    status: 'Terjadwal',
    locked: false
  };

  const elements = {
    confirmPostponeRapatModal: postponeDialog,
    confirmPostponeRapatTitleText: { textContent: '' },
    btnConfirmPostponeRapat: { disabled: false, innerHTML: 'Tunda Rapat' },
    btnCancelPostponeRapat: { disabled: false },
    rescheduleRapatModal: rescheduleDialog,
    rescheduleRapatTitleText: { textContent: '' },
    rescheduleCurrentScheduleText: { textContent: '' },
    rescheduleTanggal: tanggalInput,
    rescheduleJamMulai: jamMulaiInput,
    rescheduleJamSelesai: jamSelesaiInput,
    btnConfirmRescheduleRapat: { disabled: false, innerHTML: 'Simpan Jadwal Baru' },
    btnCancelRescheduleRapat: { disabled: false },
    modalJadwalRapat: { classList: { contains: () => false } },
    formJadwalRapat: { querySelector: sel => { const m = /\[name="([^"]+)"\]/.exec(sel); return m ? formFields[m[1]] : null; } }
  };

  const context = vm.createContext({
    allRapatData: [meeting],
    editingRapatId: 55,
    pendingPostponeRapatId: null,
    postponeRapatBusy: false,
    pendingRescheduleRapatId: null,
    rescheduleRapatBusy: false,
    document: { getElementById: id => elements[id] || null },
    visitRpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      if (name === 'postponeAgendaRapat') return { ...meeting, status: 'Ditunda' };
      if (name === 'rescheduleAgendaRapat') {
        return {
          ...meeting,
          tanggal: payload.tanggal,
          jam_mulai: payload.jam_mulai,
          jam_selesai: payload.jam_selesai,
          status: 'Terjadwal',
          schedule_history: [{ tanggal: '2026-11-15', jam_mulai: '09:00', jam_selesai: '10:00', nama_ruangan: meeting.nama_ruangan }]
        };
      }
      return null;
    },
    renderMeetingsList: () => { renderCount++; },
    applyModalRapatMode: () => { applyModeCalls++; },
    setBookingCalendarState: () => { },
    loadAllDashboard: () => { },
    showToast() { }
  });

  for (const fn of [
    'isMeetingLocked', 'formatMeetingDate',
    'confirmPostponeMeeting', 'closeConfirmPostponeRapat', 'executeConfirmPostponeRapat',
    'openRescheduleMeeting', 'closeRescheduleRapat', 'executeRescheduleRapat'
  ]) {
    vm.runInContext(extractFn(html, fn), context);
  }

  // Cancel Tunda Rapat does not mutate
  context.confirmPostponeMeeting(55);
  assert.equal(postponeDialog.open, true);
  context.closeConfirmPostponeRapat();
  assert.equal(postponeDialog.open, false);
  assert.equal(rpcCalls.length, 0);

  // Execute Tunda Rapat
  context.confirmPostponeMeeting(55);
  await context.executeConfirmPostponeRapat();
  assert.equal(postponeDialog.open, false);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[0])), { name: 'postponeAgendaRapat', payload: { rapat_id: 55 } });
  assert.equal(context.allRapatData[0].status, 'Ditunda');

  // Open Jadwalkan Ulang starts empty so user must enter a new date/time
  context.openRescheduleMeeting(55);
  assert.equal(rescheduleDialog.open, true);
  assert.equal(tanggalInput.value, '');
  assert.equal(jamMulaiInput.value, '');
  assert.equal(jamSelesaiInput.value, '');

  // Execute Jadwalkan Ulang
  tanggalInput.value = '2026-11-20';
  jamMulaiInput.value = '13:00';
  jamSelesaiInput.value = '15:00';
  await context.executeRescheduleRapat({ preventDefault() { }, target: { reportValidity: () => true } });
  assert.equal(rescheduleDialog.open, false);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls[1])), {
    name: 'rescheduleAgendaRapat',
    payload: { rapat_id: 55, tanggal: '2026-11-20', jam_mulai: '13:00', jam_selesai: '15:00' }
  });
  assert.equal(context.allRapatData[0].status, 'Terjadwal');
  assert.equal(context.allRapatData[0].tanggal, '2026-11-20');
  assert.equal(context.allRapatData[0].schedule_history.length, 1);
  assert.equal(formFields.tanggal.value, '2026-11-20');
  assert.equal(renderCount, 2);
  assert.equal(applyModeCalls, 2);
});

test('GAS backend enforces postponeAgendaRapat and rescheduleAgendaRapat permissions, transitions, slot release, history, and 14-column schema', () => {
  const rows = [
    [1, 'RPT-20261115-001', 'Rapat Revisi 04', 1, 'Ruang Rapat Utama Diskum', '2026-11-15', '09:00', '10:30', 'Sekretariat', 'Adrial, S.K.M, M.K.M.', 10, 'Pembahasan revisi 04', 'Terjadwal', '2026-11-10 08:00:00'],
    [2, 'RPT-20261116-002', 'Rapat Bentrok', 1, 'Ruang Rapat Utama Diskum', '2026-11-16', '13:00', '14:30', 'Sekretariat', 'Adrial, S.K.M, M.K.M.', 10, 'Rapat pembanding', 'Terjadwal', '2026-11-10 08:00:00']
  ];

  // Unauthenticated caller fails before reading spreadsheet
  const unauth = createGasHarness({ initialMeetings: rows, isAdmin: false });
  assert.equal(unauth.context.postponeAgendaRapat({ rapat_id: 1 }).success, false);
  assert.equal(unauth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-18', jam_mulai: '09:00', jam_selesai: '10:00' }).success, false);
  assert.equal(unauth.getSpreadsheetCalls(), 0);

  const auth = createGasHarness({ initialMeetings: rows, isAdmin: true });

  // Tunda Rapat sets Ditunda, frees room slot, and blocks duplicate postpone / premature uploads / lock
  const postponeRes = auth.context.postponeAgendaRapat({ rapat_id: 1 });
  assert.equal(postponeRes.success, true, postponeRes.error);
  assert.equal(postponeRes.data.status, 'Ditunda');
  assert.equal(auth.sheets.get('Data_Rapat').rows[0][12], 'Ditunda');
  assert.equal(auth.sheets.get('Data_Rapat').rows[0].length, 14, 'Data_Rapat stays 14 columns');

  assert.equal(auth.context.postponeAgendaRapat({ rapat_id: 1 }).success, false, 'cannot postpone twice');
  assert.equal(auth.context.saveAgendaPhotos({ rapat_id: 1, files: [{ name: 'f.jpg', data: 'data:image/jpeg;base64,/9j/2Q==' }] }).success, false, 'cannot upload photo while Ditunda');
  assert.equal(auth.context.lockAgendaRapat({ rapat_id: 1 }).success, false, 'cannot lock while Ditunda');
  assert.equal(auth.context.updateJadwalRapat({
    rapat_id: 1, judul: 'Edit', ruangan: '1|Ruang Rapat Utama Diskum', tanggal: '2026-11-17', jam_mulai: '09:00', jam_selesai: '10:30',
    bidang: 'Sekretariat', pimpinan: 'Adrial', agenda: 'Agenda'
  }).success, false, 'cannot change schedule of Ditunda meeting outside Jadwalkan Ulang');

  // Freed slot can be booked by another meeting while meeting 1 is Ditunda
  assert.equal(auth.context.simpanJadwalRapat(completeMeetingPayload({
    ruangan: '1|Ruang Rapat Utama Diskum', tanggal: '2026-11-15', jam_mulai: '09:00', jam_selesai: '10:30'
  })).success, true, 'Ditunda frees the original room slot');

  // Jadwalkan Ulang rejects missing/invalid/unchanged date/time and room clashes
  assert.equal(auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '', jam_mulai: '10:00', jam_selesai: '11:00' }).success, false);
  assert.equal(auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-15', jam_mulai: '09:00', jam_selesai: '10:30' }).success, false, 'must supply new date/time');
  assert.equal(auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-16', jam_mulai: '13:30', jam_selesai: '14:00' }).success, false, 'rejects room clash');

  // Valid Jadwalkan Ulang updates schedule, resets status to Terjadwal, and preserves original schedule in Riwayat_Agenda
  const resched1 = auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-18', jam_mulai: '10:00', jam_selesai: '11:30' });
  assert.equal(resched1.success, true, resched1.error);
  assert.equal(resched1.data.status, 'Terjadwal');
  assert.equal(resched1.data.tanggal, '2026-11-18');
  assert.equal(resched1.data.jam_mulai, '10:00');
  assert.equal(resched1.data.jam_selesai, '11:30');
  assert.equal(resched1.data.schedule_history.length, 1);
  assert.deepEqual(
    {
      tanggal: resched1.data.schedule_history[0].tanggal,
      jam_mulai: resched1.data.schedule_history[0].jam_mulai,
      jam_selesai: resched1.data.schedule_history[0].jam_selesai
    },
    { tanggal: '2026-11-15', jam_mulai: '09:00', jam_selesai: '10:30' }
  );

  // Second reschedule preserves original schedule at [0] and intermediate schedule at [1]
  const resched2 = auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-19', jam_mulai: '14:00', jam_selesai: '15:30' });
  assert.equal(resched2.success, true, resched2.error);
  assert.equal(resched2.data.schedule_history.length, 2);
  assert.equal(resched2.data.schedule_history[0].tanggal, '2026-11-15');
  assert.equal(resched2.data.schedule_history[1].tanggal, '2026-11-18');
  assert.ok(auth.sheets.get('Riwayat_Agenda'), 'history stored in lazy sidecar sheet');
  assert.equal(auth.sheets.get('Data_Rapat').rows[0].length, 14, 'Data_Rapat stays 14 columns');

  // Locking blocks postpone and reschedule
  assert.equal(auth.context.lockAgendaRapat({ rapat_id: 1 }).success, true);
  assert.equal(auth.context.postponeAgendaRapat({ rapat_id: 1 }).success, false, 'locked blocks Tunda Rapat');
  assert.equal(auth.context.rescheduleAgendaRapat({ rapat_id: 1, tanggal: '2026-11-22', jam_mulai: '09:00', jam_selesai: '10:00' }).success, false, 'locked blocks Jadwalkan Ulang');
});

test('attendance availability closes when meeting is Ditunda and re-opens after reschedule', () => {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync('Admin/MeetingRooms.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], c);
  const now = new Date('2026-11-15T02:00:00Z');
  const postponed = { tanggal: '2026-11-15', jam_mulai: '09:00', jam_selesai: '11:00', status: 'Ditunda', locked: false };
  assert.equal(c.attendanceAvailability_(postponed, now).open, false);
  assert.equal(c.adminAttendanceAvailability_(postponed, now).open, false);
  assert.equal(c.attendanceAvailability(postponed, now).open, false);
  assert.equal(c.adminAttendanceAvailability(postponed, now).open, false);
});

test('Jadwal Rapat sorts descending by meeting date/time in AutoSort, getRapatCalendar, and renderMeetingsList; Ditunda card keeps Ditunda status even if past', () => {
  // 1. AutoSort.js
  const autoSortCtx = vm.createContext({ Logger: { log() { } } });
  vm.runInContext(fs.readFileSync('Admin/AutoSort.js', 'utf8'), autoSortCtx);
  let sortSpec = null;
  const mockSheet = {
    getLastRow: () => 4,
    getLastColumn: () => 14,
    getRange: () => ({ sort: spec => { sortSpec = spec; } })
  };
  autoSortCtx.autoSortRapat({ getSheetByName: name => (name === 'Data_Rapat' ? mockSheet : null) });
  assert.deepEqual(JSON.parse(JSON.stringify(sortSpec)), [
    { column: 6, ascending: false },
    { column: 7, ascending: false }
  ]);

  // 2. getRapatCalendar
  const { context } = createGasHarness({
    initialMeetings: [
      [1, 'RPT-1', 'Awal', 1, 'Ruang Rapat Utama Diskum', '2026-11-10', '08:00', '09:00', 'Sekretariat', 'A', 5, 'Ag', 'Terjadwal', ''],
      [2, 'RPT-2', 'Terbaru', 1, 'Ruang Rapat Utama Diskum', '2026-11-15', '14:00', '15:00', 'Sekretariat', 'A', 5, 'Ag', 'Terjadwal', ''],
      [3, 'RPT-3', 'Tengah', 1, 'Ruang Rapat Utama Diskum', '2026-11-15', '09:00', '10:00', 'Sekretariat', 'A', 5, 'Ag', 'Ditunda', '']
    ]
  });
  const calendar = context.getRapatCalendar().data;
  assert.deepEqual(calendar.map(m => m.id), [2, 3, 1]);

  // 3. Client renderMeetingsList descending + Ditunda badge precedence
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const containers = {};
  const uiCtx = vm.createContext({
    MEETING_ROOMS: rooms,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-20T05:00:00Z'])); } },
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    document: { getElementById: id => containers[id] ||= { innerHTML: '' } },
    filterAgendaRecords_: require('../agenda-search').filter
  });
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], uiCtx);
  for (const fn of ['isMeetingLocked', 'getMeetingRoomInfo', 'renderMeetingRoomBadge', 'formatMeetingDate', 'isMeetingOverdue', 'meetingStatusInfo', 'canAdminRecordAttendance', 'renderMeetingsList']) {
    vm.runInContext(extractFn(html, fn), uiCtx);
  }

  uiCtx.renderMeetingsList([
    { id: 10, judul_rapat: 'Rapat Lama', tanggal: '2026-11-01', jam_mulai: '08:00', jam_selesai: '09:00', status: 'Ditunda' },
    { id: 11, judul_rapat: 'Rapat Paling Baru', tanggal: '2026-11-25', jam_mulai: '13:00', jam_selesai: '14:00', status: 'Terjadwal' },
    { id: 12, judul_rapat: 'Rapat Pagi', tanggal: '2026-11-25', jam_mulai: '08:00', jam_selesai: '09:00', status: 'Terjadwal' }
  ]);
  const rendered = containers.meetingsListContainer.innerHTML;
  assert.ok(rendered.indexOf('Rapat Paling Baru') < rendered.indexOf('Rapat Pagi'));
  assert.ok(rendered.indexOf('Rapat Pagi') < rendered.indexOf('Rapat Lama'));
  assert.match(rendered, /Ditunda/, 'overdue Ditunda agenda retains Ditunda status badge');
  assert.doesNotMatch(rendered, /Menunggu Foto/);
});

test('attendance list orders Diskum attendees by official organizational hierarchy (RapatPimpinan 1..13 then Master_Pegawai/unit order), and non-Diskum chronologically', () => {
  // Verify server leadership & unit ordering stay synchronized with RapatPimpinan.html and Presensi.html
  const pimpinanHtml = fs.readFileSync('Admin/RapatPimpinan.html', 'utf8');
  const presensiHtml = fs.readFileSync('Admin/Presensi.html', 'utf8');
  const pimpinanCtx = vm.createContext({});
  vm.runInContext(pimpinanHtml.match(/<script>([^]*?)<\/script>/)[1], pimpinanCtx);
  const expectedLeaders = JSON.parse(vm.runInContext('JSON.stringify(RAPAT_PIMPINAN_DIRECTORY)', pimpinanCtx));
  const preferredMatch = presensiHtml.match(/const preferred=(\[[^\]]+\]);/);
  assert.ok(preferredMatch, 'Presensi.html preferred unit order exists');
  const expectedUnits = JSON.parse(preferredMatch[1].replace(/'/g, '"'));

  const attendanceRows = [
    // Deliberately submitted out of hierarchy order (non-Diskum first, staff before Kabid/Sekretaris/Kadis)
    [1, 9, 'Rapat Koordinasi', 'OPD_Pemko', 'Budi Pemko', '-', 'Kabid OPD', 'Dinas Perdagangan', '', '2026-11-11 08:01:00', '', 'QR', '2026-11-11 08:01:00'],
    [2, 9, 'Rapat Koordinasi', 'Diskum', 'Afrinaldi', '19890917 202521 1 023', 'Pengadministrasi Perkantoran', 'Diskum Batam', '', '2026-11-11 08:02:00', '', 'QR', '2026-11-11 08:02:00'],
    [3, 9, 'Rapat Koordinasi', 'Diskum', 'Vinggo Sepco Putra, A.Md.', '19960913 202203 1 003', 'Pengolah Data dan Informasi', 'Diskum Batam', '', '2026-11-11 08:03:00', '', 'QR', '2026-11-11 08:03:00'],
    [4, 9, 'Rapat Koordinasi', 'Diskum', 'Septia Yorita, S.E.', '19810906 200901 2 002', 'Kepala Subbagian Umum dan Kepegawaian', 'Diskum Batam', '', '2026-11-11 08:04:00', '', 'QR', '2026-11-11 08:04:00'],
    [5, 9, 'Rapat Koordinasi', 'Diskum', 'Padlinsono, M.Si.', '19761206 200212 1 012', 'Kepala Bidang Pemberdayaan dan Pelindungan Koperasi', 'Diskum Batam', '', '2026-11-11 08:05:00', '', 'QR', '2026-11-11 08:05:00'],
    [6, 9, 'Rapat Koordinasi', 'Diskum', 'Adrial, S.K.M, M.K.M.', '19710520 199403 1 009', 'Sekretaris', 'Diskum Batam', '', '2026-11-11 08:06:00', '', 'QR', '2026-11-11 08:06:00'],
    [7, 9, 'Rapat Koordinasi', 'Diskum', 'Salim, S.Sos, M.Si', '19681021 199010 1 001', 'Kepala Dinas', 'Diskum Batam', '', '2026-11-11 08:07:00', '', 'QR', '2026-11-11 08:07:00'],
    [8, 9, 'Rapat Koordinasi', 'Tamu_Luar', 'Tamu Eksternal', '-', 'Staf', 'Kemenkop', '', '2026-11-11 08:00:00', '', 'QR', '2026-11-11 08:00:00']
  ];

  const dir = JSON.parse(fs.readFileSync('local-test/previews/employee-directory.json', 'utf8'));
  const employeeSheetRows = dir.map((e, i) => [i + 1, e.nip, e.nama, e.jabatan, e.bidang, 0, 0, 'Aktif', e.pangkat]);

  const { context } = createGasHarness({
    initialMeetings: [[9, 'RPT-9', 'Rapat Koordinasi', 1, 'Ruang Rapat Utama Diskum', '2026-11-11', '08:00', '10:00', 'Dinas', 'Salim, S.Sos, M.Si', 10, 'Koordinasi', 'Terjadwal', '2026-11-11 07:00:00']],
    initialEmployees: employeeSheetRows,
    initialAttendance: attendanceRows
  });

  // Verify shared server constants match existing master definitions
  assert.deepEqual(
    JSON.parse(vm.runInContext('JSON.stringify(OFFICIAL_LEADERSHIP_ORDER_)', context)).map(x => ({ no: x.no, nama: x.nama, nip: x.nip })),
    expectedLeaders.map(x => ({ no: x.no, nama: x.nama, nip: x.nip }))
  );
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(OFFICIAL_UNIT_ORDER_)', context)), expectedUnits);

  const res = context.getAgendaAttendance({ rapat_id: 9 });
  assert.equal(res.success, true, res.error);
  assert.deepEqual(res.data.attendance.map(r => r.nama), [
    'Salim, S.Sos, M.Si',         // Leader #1
    'Adrial, S.K.M, M.K.M.',      // Leader #2
    'Padlinsono, M.Si.',          // Leader #4
    'Septia Yorita, S.E.',        // Leader #11
    'Vinggo Sepco Putra, A.Md.',  // Sekretariat staff (unit order before Bidang Kewirausahaan)
    'Afrinaldi',                  // Bidang Kewirausahaan staff
    'Tamu Eksternal',             // Non-Diskum 08:00
    'Budi Pemko'                  // Non-Diskum 08:01
  ]);
  assert.deepEqual(res.data.attendance.map(r => r.no), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('local HTTP server supports Revision 04 postpone, reschedule with history, descending sort, and hierarchy attendance order', async () => {
  const server = createLocalTestServer({
    now: () => new Date('2026-11-10T05:00:00Z'),
    seed: {
      meetings: [
        { id: 101, kode_rapat: 'RPT-20261102-101', judul_rapat: 'Rapat Seed 1', ruangan_id: 6001, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-02', jam_mulai: '09:00', jam_selesai: '10:30', penyelenggara_bidang: 'Sekretariat', pimpinan_rapat: 'Adrial', jumlah_peserta: 5, agenda: 'Agenda 1', status: 'Terjadwal' },
        { id: 102, kode_rapat: 'RPT-20261103-102', judul_rapat: 'Rapat Seed 2', ruangan_id: 6002, nama_ruangan: 'Ruangan Bidang Koperasi & UMKM', tanggal: '2026-11-03', jam_mulai: '13:00', jam_selesai: '14:30', penyelenggara_bidang: 'Bidang Koperasi', pimpinan_rapat: 'Kabid', jumlah_peserta: 4, agenda: 'Agenda 2', status: 'Terjadwal' }
      ]
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
    const initial = (await rpc('getRapatCalendar')).data;
    assert.ok(initial.length >= 2);
    for (let i = 1; i < initial.length; i++) {
      const prevKey = `${initial[i - 1].tanggal} ${initial[i - 1].jam_mulai}`;
      const currKey = `${initial[i].tanggal} ${initial[i].jam_mulai}`;
      assert.ok(prevKey >= currKey, `expected descending calendar order at index ${i}: ${prevKey} >= ${currKey}`);
    }

    const room = (await rpc('getMasterData')).data.ruangan[0];
    assert.equal((await rpc('simpanJadwalRapat', {
      judul: 'Rapat Uji Alur Rev04',
      ruangan: `${room.id}|${room.nama_ruangan}`,
      tanggal: '2026-11-25',
      jam_mulai: '09:00',
      jam_selesai: '10:30',
      bidang: 'Sekretariat',
      pimpinan: 'Adrial, S.K.M, M.K.M.',
      agenda: 'Pengujian Tunda dan Jadwalkan Ulang'
    })).success, true);

    const created = (await rpc('getRapatCalendar')).data.find(m => m.judul_rapat === 'Rapat Uji Alur Rev04');
    assert.ok(created);

    // Tunda Rapat -> Ditunda, frees room slot
    const postponed = await rpc('postponeAgendaRapat', { rapat_id: created.id });
    assert.equal(postponed.success, true, postponed.error);
    assert.equal(postponed.data.status, 'Ditunda');

    // Attendance blocked while Ditunda
    assert.equal((await rpc('submitAdminPresensiRapat', {
      rapat_id: created.id, kategori_peserta: 'Diskum', nama: 'Salim, S.Sos, M.Si', jam_kehadiran: '09:10'
    })).success, false);

    // Jadwalkan Ulang -> Terjadwal, preserves original schedule in history
    const rescheduled = await rpc('rescheduleAgendaRapat', {
      rapat_id: created.id, tanggal: '2026-11-10', jam_mulai: '10:00', jam_selesai: '12:00'
    });
    assert.equal(rescheduled.success, true, rescheduled.error);
    assert.equal(rescheduled.data.status, 'Terjadwal');
    assert.equal(rescheduled.data.tanggal, '2026-11-10');
    assert.equal(rescheduled.data.schedule_history.length, 1);
    assert.equal(rescheduled.data.schedule_history[0].tanggal, '2026-11-25');

    // Hierarchy attendance ordering on rescheduled agenda
    assert.equal((await rpc('submitAdminPresensiRapat', {
      rapat_id: created.id, kategori_peserta: 'OPD_Pemko', nama: 'Peserta Luar', nama_opd: 'Dinas Perdagangan', jam_kehadiran: '10:00'
    })).success, true);
    assert.equal((await rpc('submitAdminPresensiRapat', {
      rapat_id: created.id, kategori_peserta: 'Diskum', nama: 'Afrinaldi', nip: '19890917 202521 1 023', jam_kehadiran: '10:05'
    })).success, true);
    assert.equal((await rpc('submitAdminPresensiRapat', {
      rapat_id: created.id, kategori_peserta: 'Diskum', nama: 'Salim, S.Sos, M.Si', nip: '19681021 199010 1 001', jam_kehadiran: '10:15'
    })).success, true);

    const att = await rpc('getAgendaAttendance', { rapat_id: created.id });
    assert.equal(att.success, true, att.error);
    assert.deepEqual(att.data.attendance.map(r => r.nama), ['Salim, S.Sos, M.Si', 'Afrinaldi', 'Peserta Luar']);

    // Lock prevents subsequent postpone/reschedule
    assert.equal((await rpc('lockAgendaRapat', { rapat_id: created.id })).success, true);
    assert.equal((await rpc('postponeAgendaRapat', { rapat_id: created.id })).success, false);
    assert.equal((await rpc('rescheduleAgendaRapat', { rapat_id: created.id, tanggal: '2026-11-28', jam_mulai: '09:00', jam_selesai: '10:00' })).success, false);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('PublicApi omits schedule_history and Alur_Kunjungan booking syncs on VISIT- reschedule and allows Ditunda cancellation', () => {
  const pubCtx = vm.createContext({
    getRapatCalendar: () => ({
      success: true,
      data: [{
        id: 1, kode_rapat: 'RPT-1', kode_kunjungan: '', judul_rapat: 'Agenda', nama_ruangan: 'Ruang',
        tanggal: '2026-11-18', jam_mulai: '09:00', jam_selesai: '10:00', status: 'Terjadwal',
        locked: false, notula: null, manual_attendance: false,
        schedule_history: [{ tanggal: '2026-11-10', diubah_oleh: 'admin@secret.local' }]
      }]
    })
  });
  vm.runInContext(fs.readFileSync('Admin/PublicApi.js', 'utf8'), pubCtx);
  const pubCal = pubCtx.getPublicAttendanceCalendar();
  assert.equal(pubCal.success, true);
  assert.doesNotMatch(JSON.stringify(pubCal), /schedule_history|diubah_oleh|secret/);

  const wfState = {
    version: 3,
    status: 'Menunggu Kedatangan',
    schedule: { tanggal: '2026-11-18', jam: '09:00' },
    booking: { id: 10, kode_rapat: 'VISIT-TLD-10', ruangan_id: 1, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-18', jam_mulai: '09:00', jam_selesai: '10:00' }
  };
  const { context, sheets } = createGasHarness({
    initialMeetings: [
      [10, 'VISIT-TLD-10', 'Kunjungan Tamu', 1, 'Ruang Rapat Utama Diskum', '2026-11-18', '09:00', '10:00', 'Sekretariat', 'PIC', 3, 'Koordinasi', 'Terjadwal', '2026-11-10 08:00:00'],
      [11, 'RPT-11', 'Rapat Batal Setelah Tunda', 1, 'Ruang Rapat Utama Diskum', '2026-11-19', '09:00', '10:00', 'Sekretariat', 'PIC', 3, 'Internal', 'Terjadwal', '2026-11-10 08:00:00']
    ],
    initialWorkflows: [['TLD-10', 3, JSON.stringify(wfState), '2026-11-10T08:00:00Z']]
  });
  context.visitWorkflowSheet_ = ss => ss.getSheetByName('Alur_Kunjungan');

  assert.equal(context.postponeAgendaRapat({ rapat_id: 10 }).success, true);
  const visitResched = context.rescheduleAgendaRapat({ rapat_id: 10, tanggal: '2026-11-24', jam_mulai: '13:00', jam_selesai: '14:30' });
  assert.equal(visitResched.success, true, visitResched.error);
  const savedWf = JSON.parse(sheets.get('Alur_Kunjungan').rows[1][2]);
  assert.equal(savedWf.booking.tanggal, '2026-11-24');
  assert.equal(savedWf.booking.jam_mulai, '13:00');
  assert.equal(savedWf.booking.jam_selesai, '14:30');
  assert.equal(savedWf.schedule.tanggal, '2026-11-24');

  // Postponed meeting can subsequently be cancelled
  assert.equal(context.postponeAgendaRapat({ rapat_id: 11 }).success, true);
  assert.equal(context.cancelAgendaRapat({ rapat_id: 11 }).success, true);
  assert.equal(sheets.get('Data_Rapat').rows[1][12], 'Dibatalkan');
});

test('renderTodayMeetings and renderMeetingsList do not duplicate Bidang label prefix', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const containers = {};
  const ctx = vm.createContext({
    MEETING_ROOMS: rooms,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-12T01:00:00Z'])); } },
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    document: { getElementById: id => containers[id] ||= { innerHTML: '' } },
    filterAgendaRecords_: require('../agenda-search').filter
  });
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], ctx);
  for (const fn of ['isMeetingLocked', 'getMeetingRoomInfo', 'renderMeetingRoomBadge', 'formatMeetingDate', 'isMeetingOverdue', 'meetingStatusInfo', 'canAdminRecordAttendance', 'renderTodayMeetings', 'renderMeetingsList']) {
    vm.runInContext(extractFn(html, fn), ctx);
  }
  const sample = [
    { id: 1, judul_rapat: 'Rapat Kewirausahaan', nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-12', jam_mulai: '09:00', jam_selesai: '10:00', penyelenggara_bidang: 'Bidang Kewirausahaan', pimpinan_rapat: 'Syofya Nora, S.H.I.', status: 'Terjadwal' },
    { id: 2, judul_rapat: 'Rapat Dinas', nama_ruangan: 'Ruang Rapat Pimpinan / Kadis', tanggal: '2026-11-12', jam_mulai: '13:00', jam_selesai: '14:00', penyelenggara_bidang: 'Dinas', pimpinan_rapat: 'Salim, S.Sos, M.Si', status: 'Terjadwal' }
  ];
  ctx.renderTodayMeetings(sample);
  ctx.renderMeetingsList(sample);
  assert.doesNotMatch(containers.todayMeetingsList.innerHTML, /Bidang Bidang|Bidang Dinas/);
  assert.match(containers.todayMeetingsList.innerHTML, /Bidang Kewirausahaan • Pimpinan:/);
  assert.match(containers.todayMeetingsList.innerHTML, /Dinas • Pimpinan:/);
  assert.doesNotMatch(containers.meetingsListContainer.innerHTML, /Penyelenggara:\s*Bidang/);
  assert.match(containers.meetingsListContainer.innerHTML, /Penyelenggara:\s*<strong>Bidang Kewirausahaan<\/strong>/);
  assert.match(containers.meetingsListContainer.innerHTML, /Penyelenggara:\s*<strong>Dinas<\/strong>/);
});

test('GAS VISIT- postpone and cancel sync Alur_Kunjungan and Data_Tamu without losing history, and unlock stays disabled', () => {
  const wfPendingArrival = {
    version: 3,
    status: 'Menunggu Kedatangan',
    schedule: { tanggal: '2026-11-18', jam: '09:00' },
    booking: { id: 10, kode_rapat: 'VISIT-TLD-10', ruangan_id: 1, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-18', jam_mulai: '09:00', jam_selesai: '10:00' },
    history: [{ action: 'book', status: 'Menunggu Kedatangan' }]
  };
  const wfSppd = {
    version: 5,
    status: 'Kelola SPPD',
    arrival: { at: '2026-11-19T10:00:00Z', count: 1 },
    schedule: { tanggal: '2026-11-19', jam: '09:00' },
    booking: { id: 11, kode_rapat: 'VISIT-TLD-11', ruangan_id: 1, nama_ruangan: 'Ruang Rapat Utama Diskum', tanggal: '2026-11-19', jam_mulai: '09:00', jam_selesai: '10:00' },
    history: [{ action: 'arrival', status: 'Kelola SPPD' }]
  };
  const { context, sheets } = createGasHarness({
    initialMeetings: [
      [10, 'VISIT-TLD-10', 'Kunjungan Tamu 10', 1, 'Ruang Rapat Utama Diskum', '2026-11-18', '09:00', '10:00', 'Sekretariat', 'PIC', 3, 'Koordinasi', 'Terjadwal', '2026-11-10 08:00:00'],
      [11, 'VISIT-TLD-11', 'Kunjungan Tamu 11', 1, 'Ruang Rapat Utama Diskum', '2026-11-19', '09:00', '10:00', 'Sekretariat', 'PIC', 3, 'Koordinasi', 'Terjadwal', '2026-11-10 08:00:00']
    ],
    initialWorkflows: [
      ['TLD-10', 3, JSON.stringify(wfPendingArrival), '2026-11-10T08:00:00Z'],
      ['TLD-11', 5, JSON.stringify(wfSppd), '2026-11-10T08:00:00Z']
    ]
  });
  const tamuRows = [
    [1, 'TLD-10', 'luar_daerah', 'Instansi 10', 'Alamat', 3, 'Ketua 10', 'Anggota', 'Sekretariat', 'Agenda', 'Ketua 10', '0800', '2026-11-18', '09:00', '', '', '1', 'PIC', 1, 'Menunggu Kedatangan', ''],
    [2, 'TLD-11', 'luar_daerah', 'Instansi 11', 'Alamat', 3, 'Ketua 11', 'Anggota', 'Sekretariat', 'Agenda', 'Ketua 11', '0800', '2026-11-19', '09:00', '', '', '1', 'PIC', 1, 'Kelola SPPD', '']
  ];
  const tamuSheet = createFakeSheet(tamuRows, new Array(21).fill('H'));
  sheets.set('Data_Tamu', tamuSheet);
  context.visitWorkflowSheet_ = ss => ss.getSheetByName('Alur_Kunjungan');
  context.findRecordByColumn_ = (sheet, col, val, width) => {
    const start = sheet.headers ? 2 : 1;
    for (let i = 0; i < sheet.rows.length; i++) {
      if (String(sheet.rows[i][col - 1]) === String(val)) return { row: i + start, values: sheet.rows[i].slice(0, width || sheet.rows[i].length) };
    }
    return null;
  };

  assert.equal(typeof context.unlockAgendaRapat, 'undefined', 'no unauthenticated unlock RPC exposed');

  // Postpone VISIT-10 updates Alur_Kunjungan booking status and keeps history
  assert.equal(context.postponeAgendaRapat({ rapat_id: 10 }).success, true);
  let state10 = JSON.parse(sheets.get('Alur_Kunjungan').rows[1][2]);
  assert.equal(state10.booking.status, 'Ditunda');
  assert.equal(state10.status, 'Menunggu Kedatangan');
  assert.ok(state10.history.some(h => h.action === 'agendaPostpone'));
  assert.throws(() => context.applyVisitWorkflow_({ kode_kunjungan: 'TLD-10', tipe_tamu: 'luar_daerah' }, state10, { version: state10.version, action: 'arrival' }, { now: '2026-11-18T12:00:00Z', actor: 'Admin', attendance: [{ nama: 'Ketua 10' }] }), /ditunda/i);

  // Reschedule restores booking.status and updates Data_Tamu schedule + history
  assert.equal(context.rescheduleAgendaRapat({ rapat_id: 10, tanggal: '2026-11-24', jam_mulai: '13:00', jam_selesai: '14:30' }).success, true);
  state10 = JSON.parse(sheets.get('Alur_Kunjungan').rows[1][2]);
  assert.equal(state10.booking.status, 'Terjadwal');
  assert.equal(tamuSheet.rows[0][12], '2026-11-24');
  assert.equal(tamuSheet.rows[0][13], '13:00');
  assert.ok(state10.history.some(h => h.action === 'agendaReschedule'));

  // Cancel VISIT-10 reverts Menunggu Kedatangan -> Sudah Disposisi while preserving cancelled booking & history
  assert.equal(context.cancelAgendaRapat({ rapat_id: 10 }).success, true);
  state10 = JSON.parse(sheets.get('Alur_Kunjungan').rows[1][2]);
  assert.equal(state10.status, 'Sudah Disposisi');
  assert.equal(state10.booking, null);
  assert.equal(tamuSheet.rows[0][19], 'Sudah Disposisi');
  assert.equal(state10.cancelledBookings.length, 1);
  assert.equal(state10.cancelledBookings[0].id, 10);
  assert.ok(state10.history.some(h => h.action === 'agendaCancel'));
  assert.ok(state10.history.some(h => h.action === 'book'));

  // Cancel VISIT-11 (already Kelola SPPD) does NOT revert status to Sudah Disposisi
  assert.equal(context.cancelAgendaRapat({ rapat_id: 11 }).success, true);
  const state11 = JSON.parse(sheets.get('Alur_Kunjungan').rows[2][2]);
  assert.equal(state11.status, 'Kelola SPPD');
  assert.equal(tamuSheet.rows[1][19], 'Kelola SPPD');
  assert.ok(state11.history.some(h => h.action === 'agendaCancel'));
});

test('local HTTP server preserves VISIT- booking history across postpone, reschedule, cancel, and re-book while keeping unlock unavailable', async () => {
  const { completeTldPayload } = require('./tld-test-data');
  const server = createLocalTestServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => {
    const res = await fetch(`${base}/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, json: await res.json() };
  };

  try {
    const unlockAttempt = await rpc('unlockAgendaRapat', { rapat_id: 1 });
    assert.equal(unlockAttempt.status, 404);
    assert.equal(unlockAttempt.json.success, false);

    const file = { name: 'doc.pdf', data: 'data:application/pdf;base64,JVBERg==' };
    const reg = (await rpc('registerTamuLuar', completeTldPayload({ tanggal_kunjungan: '2026-11-26' }))).json;
    const code = reg.data.kode_kunjungan;
    let wf = (await rpc('getVisitWorkflow', { kode_kunjungan: code })).json.data;
    const step = async (action, extra = {}) => {
      const res = (await rpc('saveVisitWorkflow', { kode_kunjungan: code, version: wf.workflow.version, action, ...extra })).json;
      assert.equal(res.success, true, res.error);
      wf = res.data;
    };
    await step('destinations', { destinations: ['UPTD PLUT KUMKM'] });
    await step('confirm');
    await step('disposisi', { file });
    await step('notify');
    await step('book', { booking: { ruangan_id: 6001, tanggal: '2026-11-26', jam_mulai: '09:00', jam_selesai: '10:00' } });

    const bookedId = wf.workflow.booking.id;
    assert.equal((await rpc('postponeAgendaRapat', { rapat_id: bookedId })).json.success, true);
    wf = (await rpc('getVisitWorkflow', { kode_kunjungan: code })).json.data;
    assert.equal(wf.workflow.booking.status, 'Ditunda');

    assert.equal((await rpc('rescheduleAgendaRapat', { rapat_id: bookedId, tanggal: '2026-11-27', jam_mulai: '10:00', jam_selesai: '11:00' })).json.success, true);
    wf = (await rpc('getVisitWorkflow', { kode_kunjungan: code })).json.data;
    assert.equal(wf.workflow.booking.status, 'Terjadwal');
    assert.equal(wf.visit.tanggal_kunjungan, '2026-11-27');

    assert.equal((await rpc('cancelAgendaRapat', { rapat_id: bookedId })).json.success, true);
    wf = (await rpc('getVisitWorkflow', { kode_kunjungan: code })).json.data;
    assert.equal(wf.workflow.status, 'Sudah Disposisi');
    assert.equal(wf.workflow.booking, null);
    assert.equal(wf.workflow.cancelledBookings.length, 1);
    assert.ok(wf.workflow.history.some(h => h.action === 'agendaCancel'));

    // Re-booking after cancel creates a new agenda without reusing the cancelled ID
    await step('book', { booking: { ruangan_id: 6001, tanggal: '2026-11-28', jam_mulai: '09:00', jam_selesai: '10:00' } });
    assert.notEqual(wf.workflow.booking.id, bookedId);
    assert.equal(wf.workflow.status, 'Menunggu Kedatangan');
    assert.equal(wf.workflow.cancelledBookings.length, 1);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
