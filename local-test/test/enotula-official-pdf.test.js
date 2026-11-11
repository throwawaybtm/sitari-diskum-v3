'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const zlib = require('node:zlib');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const PDFLib = require('../vendor/pdf-lib.min.js');
const { createLocalTestServer, renderAdminHtml } = require('../server');
const { completeMeetingPayload } = require('./meeting-test-data');

function loadNotulaPdfContext(extra = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../../Admin/NotulaPdf.html'), 'utf8');
  const script = html.match(/<script>([^]*?)<\/script>/)?.[1];
  assert.ok(script, 'NotulaPdf.html must contain a <script> block');
  const ctx = vm.createContext({
    Blob,
    Uint8Array,
    ArrayBuffer,
    btoa: str => Buffer.from(str, 'binary').toString('base64'),
    atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
    jspdf: { jsPDF },
    RAPAT_PIMPINAN_DIRECTORY: [],
    document: {
      getElementById: () => null,
      addEventListener() {}
    },
    ...extra
  });
  vm.runInContext(script, ctx);
  return ctx;
}

function extractPdfContentStreams(pdfBuffer) {
  const raw = pdfBuffer.toString('latin1');
  const streams = [];
  const regex = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const dict = match[1];
    if (/\/Subtype\s*\/Image\b/.test(dict)) continue;
    let data = match[2];
    if (/\/Filter\s*\/FlateDecode\b/.test(dict)) {
      try {
        data = zlib.inflateSync(Buffer.from(data, 'latin1')).toString('latin1');
      } catch (_) {
        // Keep raw stream if non-deflate or partial match.
      }
    }
    streams.push(data);
  }
  return streams;
}

function decodePdfStrings(streamText) {
  const out = [];
  for (const m of streamText.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    out.push(
      m[0]
        .slice(1, -1)
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
    );
  }
  return out.join('\n');
}

function createGasHarness({ initialMeetings = [], initialDocs = [], initialPhotos = [], initialEmployees = [], initialAttendance = [], isAdmin = true } = {}) {
  const makeSheet = (headers, initialRows = []) => {
    const rawRows = [headers.slice(), ...initialRows.map(r => r.slice())];
    return {
      rows: rawRows,
      getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Jakarta' }),
      getLastRow: () => rawRows.length,
      getLastColumn: () => (rawRows[0] ? rawRows[0].length : headers.length),
      appendRow: row => rawRows.push(Array.from(row)),
      getRange: (r, c, n = 1, w = 1) => ({
        getValues: () => rawRows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w)),
        getDisplayValues: () => rawRows.slice(r - 1, r - 1 + n).map(row => row.slice(c - 1, c - 1 + w).map(v => String(v ?? ''))),
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
  };

  const sheets = new Map();
  sheets.set('Data_Rapat', makeSheet(new Array(14).fill('H'), initialMeetings));
  if (initialDocs.length) sheets.set('Dokumen_Agenda', makeSheet(['Agenda ID', 'Dokumen JSON', 'Diperbarui'], initialDocs));
  if (initialPhotos.length) sheets.set('Foto_Agenda', makeSheet(['Agenda ID', 'Foto JSON', 'Diperbarui'], initialPhotos));
  if (initialEmployees.length) sheets.set('Master_Pegawai', makeSheet(['ID', 'NIP', 'Nama Pegawai', 'Jabatan', 'Bidang', 'Is_LO', 'Workload_Count', 'Status_Aktif', 'Pangkat / Golongan'], initialEmployees));
  if (initialAttendance.length) sheets.set('Data_Presensi', makeSheet(['ID', 'Rapat_ID', 'Judul_Rapat', 'Kategori_Peserta', 'Nama_Peserta', 'NIP', 'Jabatan', 'Nama_OPD_Bidang', 'No_HP', 'Waktu_Hadir', 'Anggota Kunjungan ID', 'Sumber Presensi', 'Waktu Pencatatan'], initialAttendance));

  const ss = {
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      const sheet = makeSheet(['Agenda ID', 'Dokumen JSON', 'Diperbarui'], []);
      sheet.rows.length = 0; // AgendaDocuments calls appendRow for headers right after insertSheet.
      sheets.set(name, sheet);
      return sheet;
    }
  };

  let authReads = 0;
  const driveWrites = [];
  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: () => '2026-11-11 10:00:00',
      base64Encode: () => 'AQID'
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  });

  for (const file of ['MeetingRooms.js', 'VisitWorkflow.js', 'VisitArchive.js', 'EmployeeDirectory.js', 'Code.js', 'AgendaDocuments.js', 'AgendaAttendanceData.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  }
  context.getSpreadsheet = () => {
    authReads++;
    return ss;
  };
  context.requireVisitAdmin_ = () => {
    if (!isAdmin) throw new Error('Akun ini belum diberi akses admin.');
  };
  context.saveVisitWorkflowFile_ = (file, code, kind) => {
    driveWrites.push({ file, code, kind });
    return {
      name: file.name,
      url: `https://drive.google.com/file/d/${kind}-${driveWrites.length}/view`,
      mime: 'application/pdf',
      size: Math.floor((String(file.data || '').split(',')[1] || '').length * 0.75)
    };
  };
  return { context, sheets, driveWrites, getSpreadsheetCalls: () => authReads };
}

test('official E-Notula PDF preserves Notula(1).docx letterhead, logo, headings, fields, and signature block on A4', async () => {
  const ctx = loadNotulaPdfContext();
  const data = {
    sidang_rapat: 'Rapat Koordinasi Pembinaan Koperasi Triwulan IV',
    hari_tanggal: 'Rabu, 11 November 2026',
    surat_undangan: '005/DISKUM-UND/XI/2026',
    waktu_sidang_rapat: '09:00 - 11:30 WIB',
    acara: 'Pembukaan oleh pimpinan rapat\nEvaluasi capaian pembinaan koperasi\nPenutup',
    ketua: 'Drs. Hendra Wijaya, M.Si.',
    sekretaris: 'Rina Lestari, S.E.',
    pencatat: 'Dedi Pratama, S.Kom.',
    peserta: 'Bambang Sutrisno, S.Sos. (Kepala Dinas)\nDrs. Hendra Wijaya, M.Si. (Sekretaris)\nBudi Santoso (Dinas Perdagangan)',
    kegiatan: 'Rapat dibuka oleh Sekretaris Dinas tepat pukul 09:00 WIB.\n\n1. Tim menyampaikan laporan progres pendampingan koperasi sehat.\n2. Disepakati jadwal monitoring lapangan pada minggu berikutnya.',
    ttd_jabatan: 'Sekretaris Dinas Koperasi dan Usaha Mikro',
    ttd_nama: 'Drs. Hendra Wijaya, M.Si.',
    ttd_pangkat: 'Pembina Tingkat I - IV/b',
    ttd_nip: '19790102 200501 1 002'
  };

  const bytes = ctx.buildOfficialNotulaPdfBytes_(data);
  const pdfBuffer = Buffer.from(bytes);
  assert.equal(pdfBuffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdfBuffer.length < 5 * 1024 * 1024, 'generated PDF stays comfortably under 5 MB');

  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  assert.equal(pdfDoc.getPageCount(), 1);
  const { width, height } = pdfDoc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1, 'A4 portrait geometry');

  const raw = pdfBuffer.toString('latin1');
  assert.match(raw, /\/Subtype\s*\/Image\b/, 'embeds official Kota Batam logo image');

  const streams = extractPdfContentStreams(pdfBuffer);
  assert.ok(streams.length >= 1);
  const allText = streams.map(decodePdfStrings).join('\n');

  for (const expected of [
    'PEMERINTAH KOTA BATAM',
    'DINAS KOPERASI DAN USAHA MIKRO',
    'Jl. Pramuka No. 1 Sekupang, Kode Pos: 29422,',
    'Telepon (0778) 327137, Faksmilie (0778) 327137,',
    'Laman.',
    'https://diskum.batam.go.id',
    'diskum@batam.go.id',
    'NOTULA',
    'Sidang/Rapat',
    'Rapat Koordinasi Pembinaan Koperasi Triwulan IV',
    'Hari/Tanggal',
    'Rabu, 11 November 2026',
    'Surat Undangan',
    '005/DISKUM-UND/XI/2026',
    'Waktu Sidang/Rapat',
    '09:00 - 11:30 WIB',
    'Acara',
    '1.',
    'Pembukaan oleh pimpinan rapat',
    '2.',
    'Evaluasi capaian pembinaan koperasi',
    'Pimpinan Sidang/Rapat',
    'Ketua',
    'Sekretaris',
    'Rina Lestari, S.E.',
    'Pencatat',
    'Dedi Pratama, S.Kom.',
    'Peserta sidang/rapat :',
    'Bambang Sutrisno, S.Sos. (Kepala Dinas)',
    'Kegiatan Sidang/Rapat:',
    'Rapat dibuka oleh Sekretaris Dinas tepat pukul 09:00 WIB.',
    'Sekretaris Dinas Koperasi dan',
    'Usaha Mikro,',
    'Drs. Hendra Wijaya, M.Si.',
    'Pembina Tingkat I - IV/b',
    'NIP 19790102 200501 1 002'
  ]) {
    assert.ok(allText.includes(expected), `Expected PDF text to include: ${expected}`);
  }

  // Must never output template placeholder text or typos.
  assert.doesNotMatch(allText, /dan seterusnya|Disesuaikan dengan kondisi|siding\/rapat|Nama Jabatan,|Nama Jelas|Pangkat\/Golongan/);
});

test('automatic mapping preserves existing data and never invents unavailable names, NIPs, ranks, signatures, or notes', () => {
  const ctx = loadNotulaPdfContext();
  const meetingNoNip = {
    id: 12,
    kode_rapat: 'RPT-20261111-012',
    judul_rapat: 'Rapat Evaluasi Internal',
    tanggal: '2026-11-11',
    jam_mulai: '13:30',
    jam_selesai: '15:00',
    pimpinan_rapat: 'Nadia Pegawai Non-ASN',
    agenda: 'Penyelarasan laporan bulanan'
  };
  const mappedNoMatch = ctx.buildInitialNotulaData_(meetingNoNip, {
    participants: [],
    pimpinanMatch: { nama: 'Nadia Pegawai Non-ASN', jabatan: 'Pengolah Data', pangkat: '', nip: '' },
    notula: null,
    visitNote: ''
  });

  assert.equal(mappedNoMatch.sidang_rapat, 'Rapat Evaluasi Internal');
  assert.equal(mappedNoMatch.hari_tanggal, 'Rabu, 11 November 2026');
  assert.equal(mappedNoMatch.waktu_sidang_rapat, '13:30 - 15:00 WIB');
  assert.equal(mappedNoMatch.acara, 'Penyelarasan laporan bulanan');
  assert.equal(mappedNoMatch.ketua, 'Nadia Pegawai Non-ASN');
  assert.equal(mappedNoMatch.ttd_nama, 'Nadia Pegawai Non-ASN');
  assert.equal(mappedNoMatch.ttd_jabatan, 'Pengolah Data');
  assert.equal(mappedNoMatch.surat_undangan, '');
  assert.equal(mappedNoMatch.sekretaris, '');
  assert.equal(mappedNoMatch.pencatat, '');
  assert.equal(mappedNoMatch.peserta, '');
  assert.equal(mappedNoMatch.kegiatan, '');
  assert.equal(mappedNoMatch.ttd_pangkat, '');
  assert.equal(mappedNoMatch.ttd_nip, '');

  // Generating a PDF when optional fields are blank must not inject fake NIP/rank/content/placeholders.
  const pdfBuffer = Buffer.from(ctx.buildOfficialNotulaPdfBytes_(mappedNoMatch));
  const text = extractPdfContentStreams(pdfBuffer).map(decodePdfStrings).join('\n');
  assert.ok(text.includes('Pengolah Data,'));
  assert.ok(text.includes('Nadia Pegawai Non-ASN'));
  assert.doesNotMatch(text, /\bNIP\b|Pangkat\/Golongan|Nama Jabatan|Nama Jelas|undefined|null/);
});

test('long participant lists and long discussion notes paginate cleanly across pages with repeated letterhead and intact signature block', async () => {
  const ctx = loadNotulaPdfContext();
  const participants = Array.from({ length: 55 }, (_, i) => `Peserta Nomor ${i + 1} — Staf Pelaksana Bidang Pengembangan Usaha Mikro Kota Batam`).join('\n');
  const notes = Array.from({ length: 70 }, (_, i) => `Paragraf pembahasan ke-${i + 1}: Evaluasi mendalam mengenai koordinasi lintas bidang, pencatatan hasil rapat, dan tindak lanjut administrasi kegiatan di Dinas Koperasi dan Usaha Mikro Kota Batam.`).join('\n\n');

  const bytes = ctx.buildOfficialNotulaPdfBytes_({
    sidang_rapat: 'Rapat Pleno Tahunan Dengan Judul Yang Cukup Panjang Untuk Membungkus Baris',
    hari_tanggal: 'Kamis, 12 November 2026',
    surat_undangan: '',
    waktu_sidang_rapat: '08:30 - 16:00 WIB',
    acara: 'Pembukaan\nPaparan Capaian Program\nDiskusi Kelompok\nKesimpulan dan Penutup',
    ketua: 'Bambang Sutrisno, S.Sos.',
    sekretaris: '',
    pencatat: 'Petugas Notulensi',
    peserta: participants,
    kegiatan: notes,
    ttd_jabatan: 'Kepala Dinas Koperasi dan Usaha Mikro',
    ttd_nama: 'Bambang Sutrisno, S.Sos.',
    ttd_pangkat: 'Pembina Utama Muda - IV/c',
    ttd_nip: '19780515 200312 1 001'
  });

  const pdfBuffer = Buffer.from(bytes);
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  assert.ok(pdfDoc.getPageCount() >= 4, `expected >=4 pages for 55 participants + 70 paragraphs, got ${pdfDoc.getPageCount()}`);

  const streams = extractPdfContentStreams(pdfBuffer);
  assert.equal(streams.length, pdfDoc.getPageCount());

  // Every page must preserve the official Kop Surat header and stay above bottom margin (25mm = 70.87pt).
  streams.forEach((stream, idx) => {
    const text = decodePdfStrings(stream);
    assert.ok(text.includes('PEMERINTAH KOTA BATAM'), `Page ${idx + 1} preserves Kop Surat`);
    assert.ok(text.includes('DINAS KOPERASI DAN USAHA MIKRO'), `Page ${idx + 1} preserves agency title`);
    for (const tm of stream.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
      const x = Number(tm[1]);
      const y = Number(tm[2]);
      assert.ok(x >= 25 && x <= 575, `Page ${idx + 1} x=${x} within horizontal margins`);
      assert.ok(y >= 68, `Page ${idx + 1} text y=${y}pt does not clip into 25mm bottom margin`);
    }
  });

  const allText = streams.map(decodePdfStrings).join('\n');
  assert.ok(allText.includes('55.') && allText.includes('Peserta Nomor 55'));
  assert.ok(allText.includes('Paragraf pembahasan ke-1:'));
  assert.ok(allText.includes('Paragraf pembahasan ke-70:'));

  // Signature block must stay together on the final page (not split across page boundaries).
  const lastPageText = decodePdfStrings(streams.at(-1));
  assert.ok(lastPageText.includes('Pimpinan Sidang/Rapat'), 'signature heading on final page');
  assert.ok(lastPageText.includes('Kepala Dinas Koperasi dan'), 'signature jabatan line 1 on final page');
  assert.ok(lastPageText.includes('Usaha Mikro,'), 'signature jabatan wrapped line 2 on final page');
  assert.ok(lastPageText.includes('Bambang Sutrisno, S.Sos.'), 'signature name on final page');
  assert.ok(lastPageText.includes('Pembina Utama Muda - IV/c'), 'signature rank on final page');
  assert.ok(lastPageText.includes('NIP 19780515 200312 1 001'), 'signature NIP on final page');
  assert.ok(!decodePdfStrings(streams.at(-2)).includes('NIP 19780515 200312 1 001'), 'NIP not duplicated on previous page');
});

test('Admin HTML exposes Buat E-Notula alongside independent Unggah E-notula without altering formJadwalRapat or modal action rules', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const modalHtml = html.match(/<div id="modalJadwalRapat"[\s\S]*?<div id="toastContainer"/)?.[0] || '';
  assert.match(modalHtml, /id="btnCreateEditNotula"/);
  assert.match(modalHtml, /id="btnUploadEditNotula"/);

  const formHtml = html.match(/<form id="formJadwalRapat"[\s\S]*?<\/form>/)?.[0] || '';
  const namedFields = [...formHtml.matchAll(/\bname="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(namedFields, ['judul', 'ruangan', 'tanggal', 'jam_mulai', 'jam_selesai', 'bidang', 'pimpinan', 'agenda']);

  const eNotulaDialog = html.match(/<dialog id="eNotulaModal"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.ok(eNotulaDialog, 'eNotulaModal dialog exists outside formJadwalRapat');
  for (const id of [
    'notulaSidangRapat', 'notulaHariTanggal', 'notulaSuratUndangan', 'notulaWaktu', 'notulaAcara',
    'notulaKetua', 'notulaSekretaris', 'notulaPencatat', 'notulaPeserta', 'notulaKegiatan',
    'notulaTtdJabatan', 'notulaTtdNama', 'notulaTtdPangkat', 'notulaTtdNip',
    'btnPreviewNotulaPdf', 'btnSaveGeneratedNotula'
  ]) {
    assert.match(eNotulaDialog, new RegExp(`id="${id}"`), `Missing field/button ${id}`);
  }
});

test('GAS backend getAgendaNotulaContext enforces admin auth, maps real employees/attendance, and preserves independent uploads', () => {
  const employees = [
    [1, '19780515 200312 1 001', 'Bambang Sutrisno, S.Sos.', 'Kepala Dinas', 'Dinas', 0, 0, 'Aktif', 'Pembina Utama Muda - IV/c'],
    [2, '', 'Tenaga Kontrak', 'Pengadministrasi Perkantoran', 'Sekretariat', 0, 0, 'Aktif', '']
  ];
  const meetings = [
    [10, 'RPT-20261111-010', 'Rapat Pembinaan', 1, 'Ruang Rapat Utama Diskum', '2026-11-11', '09:00', '11:00', 'Dinas', 'Bambang Sutrisno, S.Sos.', 5, 'Agenda 1\nAgenda 2', 'Terjadwal', '2026-11-11 08:00:00'],
    [11, 'RPT-20261111-011', 'Rapat Non-PNS', 1, 'Ruang Rapat Utama Diskum', '2026-11-11', '13:00', '14:00', 'Sekretariat', 'Tenaga Kontrak', 2, 'Agenda internal', 'Terjadwal', '2026-11-11 08:00:00']
  ];
  const attendance = [
    [1, 10, 'Rapat Pembinaan', 'OPD_Pemko', 'Budi Pemko', '-', 'Kabid', 'Dinas Perdagangan', '', '2026-11-11 09:00:00', '', 'QR', '2026-11-11 09:00:00'],
    [2, 10, 'Rapat Pembinaan', 'Diskum', 'Bambang Sutrisno, S.Sos.', '19780515 200312 1 001', 'Kepala Dinas', 'Diskum Batam', '', '2026-11-11 09:05:00', '', 'QR', '2026-11-11 09:05:00']
  ];
  const photos = [[10, JSON.stringify([{ name: 'f.jpg', url: 'https://drive.google.com/file/d/p1/view' }]), '2026-11-11T09:10:00Z']];

  const unauth = createGasHarness({ initialMeetings: meetings, initialEmployees: employees, isAdmin: false });
  assert.equal(unauth.context.getAgendaNotulaContext({ rapat_id: 10 }).success, false);
  assert.equal(unauth.getSpreadsheetCalls(), 0, 'unauthorized context read stops before reading spreadsheet');

  const auth = createGasHarness({ initialMeetings: meetings, initialEmployees: employees, initialAttendance: attendance, initialPhotos: photos, isAdmin: true });
  const ctxRes = auth.context.getAgendaNotulaContext({ rapat_id: 10 });
  assert.equal(ctxRes.success, true, ctxRes.error);
  assert.equal(ctxRes.data.pimpinanMatch.jabatan, 'Kepala Dinas');
  assert.equal(ctxRes.data.pimpinanMatch.pangkat, 'Pembina Utama Muda - IV/c');
  assert.equal(ctxRes.data.pimpinanMatch.nip, '19780515 200312 1 001');
  assert.deepEqual(ctxRes.data.participants.map(p => p.nama), ['Bambang Sutrisno, S.Sos.', 'Budi Pemko']);

  const ctxNoNip = auth.context.getAgendaNotulaContext({ rapat_id: 11 });
  assert.equal(ctxNoNip.success, true, ctxNoNip.error);
  assert.equal(ctxNoNip.data.pimpinanMatch.jabatan, 'Pengadministrasi Perkantoran');
  assert.equal(ctxNoNip.data.pimpinanMatch.nip, '', 'never invents missing NIP');
  assert.equal(ctxNoNip.data.pimpinanMatch.pangkat, '', 'never invents missing pangkat');

  // Independent upload stays untouched (no generated flag / template_data).
  const uploadRes = auth.context.saveAgendaNotula({ rapat_id: 10, file: { name: 'scan-manual.pdf', data: 'data:application/pdf;base64,JVBERg==' } });
  assert.equal(uploadRes.success, true, uploadRes.error);
  assert.equal(uploadRes.data.name, 'scan-manual.pdf');
  assert.equal(uploadRes.data.generated, undefined);

  // SITARI-generated E-Notula stores template_data for re-editing before lock, then locks cleanly.
  const genRes = auth.context.saveAgendaNotula({
    rapat_id: 10,
    file: { name: 'E-Notula_RPT-20261111-010.pdf', data: 'data:application/pdf;base64,JVBERg==' },
    template_data: { sidang_rapat: 'Rapat Pembinaan', kegiatan: 'Catatan resmi rapat.' }
  });
  assert.equal(genRes.success, true, genRes.error);
  assert.equal(genRes.data.generated, true);
  assert.equal(genRes.data.template_data.kegiatan, 'Catatan resmi rapat.');

  assert.equal(auth.context.lockAgendaRapat({ rapat_id: 10 }).success, true);
  assert.equal(auth.context.saveAgendaNotula({
    rapat_id: 10,
    file: { name: 'blocked.pdf', data: 'data:application/pdf;base64,JVBERg==' },
    template_data: { kegiatan: 'Diubah setelah kunci' }
  }).success, false);
});

test('local HTTP server generates, stores, serves, merges with PDFLib, and locks official E-Notula PDFs end-to-end', async () => {
  const server = createLocalTestServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (name, body = {}) => (await fetch(`${base}/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })).json();

  try {
    const rooms = (await rpc('getMasterData')).data.ruangan;
    assert.equal((await rpc('simpanJadwalRapat', completeMeetingPayload({
      judul: 'Rapat Resmi E-Notula HTTP',
      ruangan: `${rooms[0].id}|${rooms[0].nama_ruangan}`,
      tanggal: '2026-11-26',
      jam_mulai: '09:00',
      jam_selesai: '11:00',
      pimpinan: 'Rini Handayani, S.E.'
    }))).success, true);

    const meeting = (await rpc('getRapatCalendar')).data.find(m => m.judul_rapat === 'Rapat Resmi E-Notula HTTP');
    assert.ok(meeting);
    assert.equal((await rpc('saveAgendaPhotos', { rapat_id: meeting.id, files: [{ name: 'foto.jpg', data: 'data:image/jpeg;base64,/9j/2Q==' }] })).success, true);

    const ctxRes = await rpc('getAgendaNotulaContext', { rapat_id: meeting.id });
    assert.equal(ctxRes.success, true, ctxRes.error);

    const pdfCtx = loadNotulaPdfContext();
    const initialData = pdfCtx.buildInitialNotulaData_(ctxRes.data.agenda, ctxRes.data);
    initialData.kegiatan = 'Pembahasan resmi berjalan lancar.\nDisetujui seluruh peserta.';
    const pdfBytes = Buffer.from(pdfCtx.buildOfficialNotulaPdfBytes_(initialData));

    const saveRes = await rpc('saveAgendaNotula', {
      rapat_id: meeting.id,
      file: {
        name: `E-Notula_${meeting.kode_rapat}.pdf`,
        data: `data:application/pdf;base64,${pdfBytes.toString('base64')}`
      },
      template_data: initialData
    });
    assert.equal(saveRes.success, true, saveRes.error);
    assert.equal(saveRes.data.generated, true);

    const docResp = await fetch(`${base}${saveRes.data.url}`);
    assert.equal(docResp.status, 200);
    const downloaded = Buffer.from(await docResp.arrayBuffer());
    assert.equal(downloaded.subarray(0, 5).toString(), '%PDF-');
    const loadedPdf = await PDFLib.PDFDocument.load(downloaded);
    assert.equal(loadedPdf.getPageCount(), 1);

    // Must remain compatible with PDFLib merging used by Visit Archive.
    const merged = await PDFLib.PDFDocument.create();
    const copied = await merged.copyPages(loadedPdf, loadedPdf.getPageIndices());
    copied.forEach(p => merged.addPage(p));
    assert.equal(merged.getPageCount(), 1);

    // Reopening context before lock returns saved template_data.
    const ctxReload = await rpc('getAgendaNotulaContext', { rapat_id: meeting.id });
    assert.equal(ctxReload.data.notula.template_data.kegiatan, initialData.kegiatan);

    // Locking blocks further saveAgendaNotula.
    assert.equal((await rpc('lockAgendaRapat', { rapat_id: meeting.id })).success, true);
    assert.equal((await rpc('saveAgendaNotula', {
      rapat_id: meeting.id,
      file: { name: 'late.pdf', data: `data:application/pdf;base64,${pdfBytes.toString('base64')}` },
      template_data: initialData
    })).success, false);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('signature block never splits across page break and long unbroken tokens wrap within margins', async () => {
  const ctx = loadNotulaPdfContext();
  // Create enough paragraphs so page 1 ends near y~255mm, leaving insufficient room for the full ~46mm signature block.
  const filler = Array.from({ length: 18 }, (_, i) => `Butir pembahasan ${i + 1}: ` + 'TOKENPANJANGTANPASPASI_'.repeat(6)).join('\n');
  const bytes = ctx.buildOfficialNotulaPdfBytes_({
    sidang_rapat: 'Rapat Pengujian Batas Halaman',
    hari_tanggal: 'Rabu, 11 November 2026',
    surat_undangan: '',
    waktu_sidang_rapat: '09:00 - 10:00 WIB',
    acara: 'Pembahasan teknis',
    ketua: 'Drs. Hendra Wijaya, M.Si.',
    sekretaris: '',
    pencatat: '',
    peserta: 'Peserta A\nPeserta B',
    kegiatan: filler,
    ttd_jabatan: 'Kepala Dinas',
    ttd_nama: 'Drs. Hendra Wijaya, M.Si.',
    ttd_pangkat: 'Pembina Tingkat I - IV/b',
    ttd_nip: '19790102 200501 1 002'
  });
  const pdfBuffer = Buffer.from(bytes);
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
  assert.ok(pdfDoc.getPageCount() >= 2);
  const streams = extractPdfContentStreams(pdfBuffer);
  const page1Text = decodePdfStrings(streams[0]);
  const lastText = decodePdfStrings(streams.at(-1));
  assert.ok(!page1Text.includes('Kepala Dinas,'), 'signature jabatan moved atomically off page 1');
  assert.ok(!page1Text.includes('NIP 19790102 200501 1 002'), 'signature NIP not orphaned on page 1');
  assert.ok(lastText.includes('Pimpinan Sidang/Rapat'), 'signature heading together on last page');
  assert.ok(lastText.includes('Kepala Dinas,'), 'signature jabatan together on last page');
  assert.ok(lastText.includes('Drs. Hendra Wijaya, M.Si.'), 'signature name together on last page');
  assert.ok(lastText.includes('NIP 19790102 200501 1 002'), 'signature NIP together on last page');

  // Verify no coordinate exceeds A4 right/bottom margins even with unbroken token strings.
  streams.forEach((stream, idx) => {
    for (const tm of stream.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
      const x = Number(tm[1]);
      const y = Number(tm[2]);
      assert.ok(x >= 25 && x <= 575, `Page ${idx + 1} x=${x} within margins`);
      assert.ok(y >= 68, `Page ${idx + 1} y=${y} above 25mm bottom margin`);
    }
  });
});

test('Edit Rapat UI gating and Notula composer client workflow enforce photo, Ditunda, Terkunci, and no-invention rules', async () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../Admin/Index.html'), 'utf8');
  const extractFn = name => {
    const m = indexHtml.match(new RegExp(`    (?:async\\s+)?function ${name}\\([^]*?\\n    \\}`));
    assert.ok(m, `Expected ${name} in Index.html`);
    return m[0];
  };

  const fields = {
    meetingEditAttachments: { hidden: true },
    meetingEditPhotoSection: { hidden: false },
    meetingEditPhotoHeadingText: { textContent: '' },
    meetingEditPhotoHint: { textContent: '' },
    meetingEditPhotoList: { innerHTML: '' },
    meetingEditPhotoUpload: { hidden: false, querySelectorAll: () => [] },
    meetingPhotoProgress: { textContent: '' },
    meetingEditNotulaInfo: { innerHTML: '' },
    meetingEditNotulaUpload: { hidden: false },
    btnCreateEditNotula: { disabled: false, title: '', innerHTML: '' },
    btnUploadEditNotula: { disabled: false, title: '', innerHTML: '' },
    meetingNotulaProgress: { textContent: '' },
    meetingEditHistorySection: { hidden: true },
    meetingEditHistoryList: { innerHTML: '' },
    meetingEditPostponeSection: { hidden: false },
    meetingEditRescheduleSection: { hidden: false },
    meetingEditLockSection: { hidden: false },
    meetingEditCancelSection: { hidden: false },
    eNotulaModal: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
    eNotulaModalError: { hidden: true, textContent: '' },
    eNotulaModalSubtitle: { textContent: '' },
    notulaEmployeeList: { options: [], replaceChildren() { this.options = []; }, appendChild(o) { this.options.push(o); } },
    notulaPesertaHint: { textContent: '' },
    notulaSidangRapat: { value: '' },
    notulaHariTanggal: { value: '' },
    notulaSuratUndangan: { value: '' },
    notulaWaktu: { value: '' },
    notulaAcara: { value: '' },
    notulaKetua: { value: '' },
    notulaSekretaris: { value: '' },
    notulaPencatat: { value: '' },
    notulaPeserta: { value: '' },
    notulaKegiatan: { value: '' },
    notulaTtdJabatan: { value: '' },
    notulaTtdNama: { value: '' },
    notulaTtdPangkat: { value: '' },
    notulaTtdNip: { value: '' },
    btnPreviewNotulaPdf: { disabled: false },
    btnSaveGeneratedNotula: { disabled: false, innerHTML: '' },
    btnCancelNotulaComposer: { disabled: false }
  };

  const meetings = [
    { id: 1, kode_rapat: 'RPT-1', judul_rapat: 'Rapat Tanpa Foto', tanggal: '2026-11-11', jam_mulai: '09:00', jam_selesai: '10:00', pimpinan_rapat: 'Ketua Uji', agenda: 'Agenda', status: 'Terjadwal', photos: [] },
    { id: 2, kode_rapat: 'RPT-2', judul_rapat: 'Rapat Siap Notula', tanggal: '2026-11-11', jam_mulai: '10:00', jam_selesai: '12:00', pimpinan_rapat: 'Drs. Hendra Wijaya, M.Si.', agenda: 'Poin 1\nPoin 2', status: 'Terjadwal', photos: [{ name: 'f.jpg', url: '/local-doc/1' }] },
    { id: 3, kode_rapat: 'VISIT-TLD-3', kode_kunjungan: 'TLD-3', judul_rapat: 'Kunjungan Tamu', tanggal: '2026-11-11', jam_mulai: '13:00', jam_selesai: '14:00', pimpinan_rapat: 'PIC Tamu', agenda: 'Koordinasi', status: 'Terjadwal', photos: [] }
  ];

  const rpcCalls = [];
  const toasts = [];
  const ctx = vm.createContext({
    Blob,
    Uint8Array,
    ArrayBuffer,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: b => Buffer.from(b, 'base64').toString('binary'),
    jspdf: { jsPDF },
    RAPAT_PIMPINAN_DIRECTORY: [],
    allRapatData: meetings,
    editingRapatId: null,
    meetingNotulaBusy: false,
    escapeHtml: v => String(v ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    document: {
      getElementById: id => fields[id] || null,
      createElement: tag => ({ tag, value: '' }),
      addEventListener() {}
    },
    renderMeetingsList() {},
    showToast: (type, title, msg) => toasts.push({ type, title, msg }),
    visitRpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      if (name === 'getAgendaNotulaContext') {
        return {
          agenda: meetings[1],
          locked: false,
          participants: [{ nama: 'Peserta Satu', jabatan: 'Analis', kategori: 'Diskum' }],
          pimpinanMatch: { nama: 'Drs. Hendra Wijaya, M.Si.', jabatan: 'Sekretaris', pangkat: 'Pembina Tingkat I - IV/b', nip: '19790102 200501 1 002' },
          employees: [
            { nama: 'Drs. Hendra Wijaya, M.Si.', jabatan: 'Sekretaris', pangkat: 'Pembina Tingkat I - IV/b', nip: '19790102 200501 1 002' },
            { nama: 'Staf Non NIP', jabatan: 'Pengolah Data', pangkat: '', nip: '' }
          ],
          notula: null,
          visitNote: ''
        };
      }
      if (name === 'saveAgendaNotula') {
        return { name: payload.file.name, url: '/local-doc/99', generated: true, template_data: payload.template_data };
      }
      return null;
    }
  });

  vm.runInContext(fs.readFileSync('Admin/NotulaPdf.html', 'utf8').match(/<script>([^]*?)<\/script>/)[1], ctx);
  vm.runInContext(extractFn('isMeetingLocked'), ctx);
  vm.runInContext(extractFn('renderMeetingEditAttachments'), ctx);

  // 1. Internal without photo disables Buat E-Notula; with photo enables it; VISIT- enables without photo; Ditunda/Terkunci hides it.
  ctx.renderMeetingEditAttachments(meetings[0]);
  assert.equal(fields.btnCreateEditNotula.disabled, true);
  assert.equal(fields.btnUploadEditNotula.disabled, true);

  ctx.renderMeetingEditAttachments(meetings[2]);
  assert.equal(fields.btnCreateEditNotula.disabled, false);

  ctx.renderMeetingEditAttachments({ ...meetings[1], status: 'Ditunda' });
  assert.equal(fields.meetingEditNotulaUpload.hidden, true);
  assert.equal(fields.btnCreateEditNotula.disabled, true);

  ctx.renderMeetingEditAttachments({ ...meetings[1], status: 'Terkunci', locked: true, notula: { name: 'e.pdf', url: '/local-doc/5' } });
  assert.equal(fields.meetingEditNotulaUpload.hidden, true);
  assert.match(fields.meetingEditNotulaInfo.innerHTML, /href="\/local-doc\/5"/);

  // 2. Open composer, inspect auto-mapped + blank unavailable fields, switch Ketua to non-NIP employee, save PDF.
  await ctx.openNotulaComposer(2);
  assert.equal(fields.eNotulaModal.open, true);
  assert.equal(fields.notulaSidangRapat.value, 'Rapat Siap Notula');
  assert.equal(fields.notulaSuratUndangan.value, '');
  assert.equal(fields.notulaSekretaris.value, '');
  assert.equal(fields.notulaPencatat.value, '');
  assert.equal(fields.notulaKegiatan.value, '');
  assert.equal(fields.notulaTtdJabatan.value, 'Sekretaris');
  assert.equal(fields.notulaTtdNip.value, '19790102 200501 1 002');
  assert.equal(fields.notulaPeserta.value, 'Peserta Satu (Analis)');

  // Selecting an employee without NIP clears auto-filled NIP/rank rather than keeping stale or inventing one.
  fields.notulaKetua.value = 'Staf Non NIP';
  ctx.onNotulaKetuaInput();
  assert.equal(fields.notulaTtdNama.value, 'Staf Non NIP');
  assert.equal(fields.notulaTtdJabatan.value, 'Pengolah Data');
  assert.equal(fields.notulaTtdPangkat.value, '');
  assert.equal(fields.notulaTtdNip.value, '');

  fields.notulaSuratUndangan.value = '005/UND/2026';
  fields.notulaKegiatan.value = 'Hasil pembahasan resmi rapat.';
  await ctx.saveGeneratedNotula();

  assert.equal(fields.eNotulaModal.open, false);
  const saveCall = rpcCalls.find(c => c.name === 'saveAgendaNotula');
  assert.ok(saveCall);
  assert.match(saveCall.payload.file.data, /^data:application\/pdf;base64,/);
  assert.equal(saveCall.payload.template_data.surat_undangan, '005/UND/2026');
  assert.equal(saveCall.payload.template_data.kegiatan, 'Hasil pembahasan resmi rapat.');
  assert.equal(meetings[1].status, 'Selesai');
  assert.match(fields.btnCreateEditNotula.innerHTML, /Edit E-Notula/);
});
