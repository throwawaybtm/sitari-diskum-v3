'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { createLocalTestServer } = require('../server');
const agendaSearch = require('../agenda-search');

const adminHtml = fs.readFileSync(path.join(__dirname, '../../Admin/Index.html'), 'utf8');
const toolsHtml = fs.readFileSync(path.join(__dirname, '../../Admin/Tools.html'), 'utf8');
const codeJs = fs.readFileSync(path.join(__dirname, '../../Admin/Code.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'));
  assert.ok(match, `Missing function ${name} in Admin/Index.html`);
  return match[0];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function makeElement(initial = {}) {
  const classes = new Set(initial.classes || []);
  return {
    innerHTML: '',
    innerText: initial.innerText || '',
    textContent: initial.textContent || '',
    value: initial.value || '',
    disabled: Boolean(initial.disabled),
    dataset: { ...(initial.dataset || {}) },
    classList: {
      add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)),
      toggle: (item, force) => {
        if (force === undefined) {
          if (classes.has(item)) classes.delete(item); else classes.add(item);
        } else if (force) {
          classes.add(item);
        } else {
          classes.delete(item);
        }
      },
      contains: item => classes.has(item)
    }
  };
}

function createAdminHarness(fetchImpl) {
  const elements = {
    todayMeetingsList: makeElement(),
    recentTamuTableBody: makeElement(),
    tamuTableBody: makeElement(),
    meetingsListContainer: makeElement(),
    visitStatusFilter: makeElement({ classes: ['hidden'], dataset: { status: '' } }),
    visitSearch: makeElement({ value: '' }),
    visitSearchDate: makeElement({ value: '' }),
    reportMonth: makeElement({ value: '2026-11' }),
    monthlyReportRows: makeElement(),
    monthlyReportCount: makeElement(),
    monthlyPdf: makeElement({ disabled: true }),
    monthlyImage: makeElement({ disabled: true }),
    monthlyFilterAll: makeElement(),
    monthlyFilterFo: makeElement(),
    monthlyFilterLd: makeElement()
  };

  for (const id of [
    'statTamuHariIni', 'statTotalTamu', 'statTamuLuar', 'statTamuFo',
    'statRapatHariIni', 'statSppdBelumLengkap', 'statSppdSah'
  ]) {
    elements[id] = makeElement({ innerText: '0' });
  }

  for (const tab of ['dashboard', 'tamu', 'calendar', 'qrcode']) {
    elements[`tab-${tab}`] = makeElement();
    elements[`mobile-tab-${tab}`] = makeElement();
    elements[`section-${tab}`] = makeElement({ classes: tab === 'dashboard' ? [] : ['hidden'] });
  }

  const toasts = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext: () => ({}),
          click() {},
          toDataURL: () => 'data:image/png;base64,'
        };
      }
    },
    window: {
      matchMedia: () => ({ matches: false }),
      scrollTo() {}
    },
    fetch: (...args) => fetchImpl(...args),
    showToast: (type, title, message) => toasts.push({ type, title, message }),
    escapeHtml,
    formatVisitDateCompact: value => String(value || ''),
    renderBidangBadges: value => escapeHtml(value || ''),
    renderMeetingsList() {},
    setBookingCalendarState() {},
    filterAgendaRecords_: agendaSearch.filter
  });

  vm.runInContext(`
    let activeSppdItem = null;
    let allTamuData = [];
    let visitListError = '';
    const tamuTableState = { key: null, direction: 'asc' };
    let allRapatData = [];
    let visitListRevision = 0;
    let visitListPatches = new Map();
    let visitListRequestRevision = 0;
    let dashboardRequestRevision = 0;
    let calendarRequestRevision = 0;
    let isExportAttempted = false;
    var jspdf = undefined;
    function getAllTamuData() { return allTamuData; }
  `, context);

  for (const name of [
    'renderPanelState',
    'renderTableState',
    'responseMessage',
    'switchTab',
    'callBackend',
    'resetDashboardStats',
    'loadAllDashboard',
    'mergeVisitPatches',
    'renderTodayMeetings',
    'renderRecentTamu',
    'getVisitStatus',
    'renderVisitStatus',
    'getSortedTamu',
    'updateTamuSortHeadings',
    'renderVisitRow',
    'clearVisitStatusFilter',
    'openSppdVisits',
    'renderTamuTable'
  ]) {
    vm.runInContext(extractFunction(adminHtml, name), context);
  }

  const toolsMatch = toolsHtml.match(/<script>([^]*?)<\/script>/);
  assert.ok(toolsMatch, 'Tools.html script block must exist');
  vm.runInContext(toolsMatch[1], context);

  return { context, elements, toasts };
}

test('callBackend forwards HTTP non-OK responses to onError and keeps HTTP 200 {success:false} on onSuccess', async () => {
  let nextResponse = async () => ({ ok: true, status: 200, text: async () => '{}' });
  const context = vm.createContext({
    console: { warn() {} },
    window: {},
    fetch: (url, opts) => nextResponse(url, opts)
  });
  vm.runInContext(extractFunction(adminHtml, 'responseMessage'), context);
  vm.runInContext(extractFunction(adminHtml, 'callBackend'), context);

  // HTTP 500 JSON payload -> onError receives message & status, not onSuccess
  nextResponse = async () => ({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({ success: false, error: 'Database unavailable' })
  });
  const http500Json = await new Promise(resolve => {
    context.callBackend('getTamuList', [], res => resolve({ kind: 'success', res }), err => resolve({ kind: 'error', err }));
  });
  assert.equal(http500Json.kind, 'error');
  assert.equal(http500Json.err.status, 500);
  assert.equal(http500Json.err.message, 'Database unavailable');

  // HTTP 502 non-JSON HTML payload -> onError receives readable HTTP error rather than SyntaxError
  nextResponse = async () => ({
    ok: false,
    status: 502,
    text: async () => '<html><body>Bad Gateway</body></html>'
  });
  const http502Html = await new Promise(resolve => {
    context.callBackend('getTamuList', [], res => resolve({ kind: 'success', res }), err => resolve({ kind: 'error', err }));
  });
  assert.equal(http502Html.kind, 'error');
  assert.equal(http502Html.err.status, 502);
  assert.match(http502Html.err.message, /HTTP 502/);

  // HTTP 200 { success: false } -> preserves GAS contract into onSuccess
  nextResponse = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: false, error: 'Sheet rusak' })
  });
  const http200Failure = await new Promise(resolve => {
    context.callBackend('getTamuList', [], res => resolve({ kind: 'success', res }), err => resolve({ kind: 'error', err }));
  });
  assert.equal(http200Failure.kind, 'success');
  assert.equal(http200Failure.res.success, false);
  assert.equal(http200Failure.res.error, 'Sheet rusak');

  // HTTP 200 non-JSON payload -> onError instead of silent null
  nextResponse = async () => ({
    ok: true,
    status: 200,
    text: async () => 'invalid-json'
  });
  const http200Invalid = await new Promise(resolve => {
    context.callBackend('getTamuList', [], res => resolve({ kind: 'success', res }), err => resolve({ kind: 'error', err }));
  });
  assert.equal(http200Invalid.kind, 'error');
  assert.match(http200Invalid.err.message, /tidak valid/i);
});

test('Buku Tamu and Laporan Bulanan show explicit errors on HTTP 500 or {success:false}, survive tab/filter changes, clear stale rows, and recover on reload', async () => {
  const sampleNov2Visitors = [
    {
      kode_kunjungan: 'TLD-02112026-001',
      tipe_tamu: 'luar_daerah',
      instansi: 'Dinas Koperasi Provinsi',
      ketua_nama: 'Rina Wijaya',
      tujuan_bidang: 'Bidang Kelembagaan',
      keperluan: 'Koordinasi November',
      narahubung_hp: '081111111111',
      tanggal_kunjungan: '2026-11-02',
      jam_kunjungan: '09:00',
      bawa_sppd: true,
      status_kunjungan: 'Menunggu Konfirmasi'
    },
    {
      kode_kunjungan: 'TDD-03112026-001',
      tipe_tamu: 'dalam_daerah_fo',
      instansi: 'Koperasi Sejahtera',
      ketua_nama: 'Andi Saputra',
      tujuan_bidang: 'Bidang Usaha Mikro',
      keperluan: 'Konsultasi NIB',
      narahubung_hp: '082222222222',
      tanggal_kunjungan: '2026-11-03',
      jam_kunjungan: '10:30',
      bawa_sppd: false,
      status_kunjungan: 'Non-SPPD'
    }
  ];

  let routes = {};
  const { context, elements, toasts } = createAdminHarness(async url => {
    const endpoint = String(url).replace(/^\/api\//, '');
    const handler = routes[endpoint];
    if (!handler) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: [] }) };
    }
    return handler();
  });

  // 1. Healthy initial load populates Buku Tamu & Laporan Bulanan
  routes = {
    getDashboardSummary: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        data: {
          stats: { tamuHariIni: 2, totalTamu: 2, tamuLuar: 1, tamuFo: 1, rapatHariIni: 0, sppd: { belumLengkap: 1, sah: 0 } },
          todayMeetings: [],
          recentTamu: sampleNov2Visitors
        }
      })
    }),
    getTamuList: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: sampleNov2Visitors })
    }),
    getRapatCalendar: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [] })
    })
  };

  await context.loadAllDashboard();
  assert.match(elements.tamuTableBody.innerHTML, /Dinas Koperasi Provinsi/);
  assert.equal(elements.monthlyReportCount.textContent, '2 kunjungan · 11-2026');
  assert.equal(elements.monthlyPdf.disabled, false);
  assert.equal(elements.monthlyImage.disabled, false);

  // 2. HTTP 500 across backend clears stale rows and displays visible error states everywhere
  toasts.length = 0;
  routes = {
    getDashboardSummary: async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ success: false, error: 'Ringkasan error HTTP 500' })
    }),
    getTamuList: async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ success: false, error: 'Sheet tamu HTTP 500' })
    }),
    getRapatCalendar: async () => ({
      ok: false,
      status: 500,
      text: async () => '<html>Internal Server Error</html>'
    })
  };

  await context.loadAllDashboard();
  assert.equal(context.getAllTamuData().length, 0);
  assert.equal(elements.statTotalTamu.innerText, '—');
  assert.match(elements.tamuTableBody.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Dinas Koperasi Provinsi/);
  assert.match(elements.monthlyReportCount.textContent, /Data kunjungan tidak tersedia/);
  assert.doesNotMatch(elements.monthlyReportCount.textContent, /\b0 kunjungan\b/);
  assert.match(elements.monthlyReportRows.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.monthlyReportRows.innerHTML, /Rina Wijaya/);
  assert.equal(elements.monthlyPdf.disabled, true);
  assert.equal(elements.monthlyImage.disabled, true);
  assert.ok(toasts.some(t => t.type === 'error' && t.title === 'Data Kunjungan Gagal Dimuat'));
  assert.ok(toasts.some(t => t.type === 'error' && t.title === 'Dashboard Gagal Dimuat'));

  // Calling exportMonthlyReport while in error state must remain a no-op
  await context.exportMonthlyReport('pdf');

  // 3. Switching tabs and invoking filter helpers must NOT overwrite the active error state
  context.switchTab('dashboard');
  context.switchTab('tamu');
  assert.match(elements.tamuTableBody.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);

  context.clearVisitStatusFilter();
  assert.match(elements.tamuTableBody.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);

  context.openSppdVisits();
  assert.match(elements.tamuTableBody.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);

  elements.visitSearch.value = 'Rina';
  context.renderTamuTable(context.getAllTamuData());
  assert.match(elements.tamuTableBody.innerHTML, /Sheet tamu HTTP 500/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);

  context.setMonthlyGuestFilter('tdd');
  assert.match(elements.monthlyReportCount.textContent, /Data kunjungan tidak tersedia TDD/);
  assert.doesNotMatch(elements.monthlyReportCount.textContent, /\b0 kunjungan\b/);
  context.setMonthlyGuestFilter('all');

  // 4. HTTP 200 { success: false } cannot be mistaken for an empty dataset
  toasts.length = 0;
  routes.getTamuList = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: false, message: 'Gagal membaca Google Sheets Data_Tamu' })
  });
  await context.loadAllDashboard({ summary: false, calendar: false });
  assert.match(elements.tamuTableBody.innerHTML, /Gagal membaca Google Sheets Data_Tamu/);
  assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan/);
  assert.match(elements.monthlyReportCount.textContent, /Data kunjungan tidak tersedia/);
  assert.doesNotMatch(elements.monthlyReportCount.textContent, /\b0 kunjungan\b/);
  assert.ok(toasts.some(t => t.type === 'error' && t.title === 'Data Kunjungan Gagal Dimuat'));

  // 5. Genuine empty { success: true, data: [] } clears error to true empty state
  elements.visitSearch.value = '';
  context.clearVisitStatusFilter();
  routes.getTamuList = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: [] })
  });
  await context.loadAllDashboard({ summary: false, calendar: false });
  context.switchTab('tamu');
  assert.match(elements.tamuTableBody.innerHTML, /Belum ada data kunjungan\./);
  assert.equal(elements.monthlyReportCount.textContent, '0 kunjungan · 11-2026');
  assert.match(elements.monthlyReportRows.innerHTML, /Tidak ada kunjungan pada bulan ini\./);
  assert.equal(elements.monthlyPdf.disabled, true);

  // 6. Successful recovery reload with Nov 2+ rows clears error and restores accurate counts
  routes = {
    getDashboardSummary: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        data: {
          stats: { tamuHariIni: 2, totalTamu: 2, tamuLuar: 1, tamuFo: 1, rapatHariIni: 0, sppd: { belumLengkap: 1, sah: 0 } },
          todayMeetings: [],
          recentTamu: sampleNov2Visitors
        }
      })
    }),
    getTamuList: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: sampleNov2Visitors })
    }),
    getRapatCalendar: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [] })
    })
  };
  await context.loadAllDashboard();
  assert.equal(elements.statTotalTamu.innerText, 2);
  assert.match(elements.tamuTableBody.innerHTML, /Dinas Koperasi Provinsi/);
  assert.match(elements.tamuTableBody.innerHTML, /Koperasi Sejahtera/);
  assert.equal(elements.monthlyReportCount.textContent, '2 kunjungan · 11-2026');
  assert.match(elements.monthlyReportRows.innerHTML, /Rina Wijaya/);
  assert.match(elements.monthlyReportRows.innerHTML, /Andi Saputra/);
  assert.equal(elements.monthlyPdf.disabled, false);
  assert.equal(elements.monthlyImage.disabled, false);
});

test('late failed getTamuList cannot clobber a newer successful reload with error state', async () => {
  const resolvers = [];
  const { context, elements } = createAdminHarness((url) => {
    if (String(url).endsWith('/getTamuList')) {
      return new Promise(resolve => resolvers.push(resolve));
    }
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: [] }) });
  });

  const firstLoad = context.loadAllDashboard({ summary: false, calendar: false });
  const secondLoad = context.loadAllDashboard({ summary: false, calendar: false });
  assert.equal(resolvers.length, 2);

  // Newer request succeeds first
  resolvers[1]({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      success: true,
      data: [{
        kode_kunjungan: 'TDD-02112026-009',
        tipe_tamu: 'dalam_daerah_fo',
        instansi: 'Koperasi Baru Pulih',
        ketua_nama: 'Budi',
        tujuan_bidang: 'Sekretariat',
        keperluan: 'Layanan',
        tanggal_kunjungan: '2026-11-02',
        jam_kunjungan: '08:00',
        bawa_sppd: false,
        status_kunjungan: 'Non-SPPD'
      }]
    })
  });
  await secondLoad;

  // Older request fails afterward -> must be ignored
  resolvers[0]({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({ success: false, error: 'Old stale failure' })
  });
  await firstLoad;

  assert.equal(context.getAllTamuData().length, 1);
  assert.match(elements.tamuTableBody.innerHTML, /Koperasi Baru Pulih/);
  assert.equal(elements.monthlyReportCount.textContent, '1 kunjungan · 11-2026');
});

test('November 2, 2026 Asia/Jakarta cutoff remains intact across GAS Code.js, local HTTP server, Buku Tamu, and Laporan Bulanan', async () => {
  // Verify GAS Data_Tamu cutoff across UTC midnight boundary (16:59:59Z = Nov 1 WIB, 17:00:00Z = Nov 2 WIB)
  const gasContext = vm.createContext({
    Utilities: {
      formatDate: (date, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd') {
          return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
        }
        return date.toISOString();
      }
    }
  });
  vm.runInContext(codeJs, gasContext);

  const tamuRows = [
    ['id', 'kode_kunjungan', 'tipe_tamu', 'instansi', 'alamat', 'jumlah_orang', 'ketua_nama', 'pengikut_list', 'tujuan_bidang', 'keperluan', 'narahubung_nama', 'narahubung_hp', 'tanggal_kunjungan', 'jam_kunjungan', 'surat_kunjungan_file', 'surat_tugas_file', 'lo_id', 'lo_nama', 'bawa_sppd', 'status_kunjungan', 'created_at'],
    [1, 'TLD-01112026-001', 'luar_daerah', 'Excluded Pre-Nov2 UTC', 'Jl. 1', 1, 'Ketua 1', '', 'Sekretariat', 'Agenda Nov 1 UTC', 'Ketua 1', '08111111111', vm.runInContext("new Date('2026-11-01T16:59:59Z')", gasContext), '23:59', '', '', 'lo1', 'LO', 1, 'Menunggu Konfirmasi', ''],
    [2, 'TLD-01112026-002', 'luar_daerah', 'Excluded Pre-Nov2 ISO', 'Jl. 1b', 1, 'Ketua 1b', '', 'Sekretariat', 'Agenda Nov 1 ISO', 'Ketua 1b', '08111111112', '2026-11-01T16:59:59Z', '23:59', '', '', 'lo1', 'LO', 1, 'Menunggu Konfirmasi', ''],
    [3, 'TLD-02112026-001', 'luar_daerah', 'Included Midnight WIB', 'Jl. 2', 1, 'Ketua 2', '', 'Sekretariat', 'Agenda Nov 2 Midnight WIB', 'Ketua 2', '08222222222', vm.runInContext("new Date('2026-11-01T17:00:00Z')", gasContext), '00:00', '', '', 'lo1', 'LO', 1, 'Menunggu Konfirmasi', ''],
    [4, 'TLD-02112026-002', 'luar_daerah', 'Included Midnight WIB ISO', 'Jl. 2b', 1, 'Ketua 2b', '', 'Sekretariat', 'Agenda Nov 2 Midnight ISO', 'Ketua 2b', '08222222223', '2026-11-01T17:00:00Z', '00:00', '', '', 'lo1', 'LO', 1, 'Menunggu Konfirmasi', ''],
    [5, 'TDD-03112026-001', 'dalam_daerah_fo', 'Included Nov 3 String', 'Jl. 3', 1, 'Ketua 3', '', 'Bidang Usaha Mikro', 'Agenda Nov 3', 'Ketua 3', '08333333333', '2026-11-03', '09:30', '', '', 'lo1', 'LO', 0, 'Non-SPPD', '']
  ];
  const fakeSpreadsheet = {
    getSheetByName: name => name === 'Data_Tamu' ? {
      getLastRow: () => tamuRows.length,
      getLastColumn: () => tamuRows[0].length,
      getRange: (r, c, nr, nc) => ({ getValues: () => tamuRows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)) })
    } : null
  };
  const gasResult = gasContext.getTamuList(fakeSpreadsheet);
  assert.equal(gasResult.success, true);
  assert.deepEqual(gasResult.data.map(item => item.instansi), ['Included Midnight WIB', 'Included Midnight WIB ISO', 'Included Nov 3 String']);

  // Verify local HTTP server feeds cutoff-compliant records cleanly into Admin UI & Laporan Bulanan
  const server = createLocalTestServer({
    now: new Date('2026-11-03T10:00:00+07:00'),
    seed: {
      visitors: [
        { id: 1, kode_kunjungan: 'TLD-01112026-001', tipe_tamu: 'luar_daerah', instansi: 'Excluded Nov 1 Local', ketua_nama: 'A', tujuan_bidang: 'Sekretariat', keperluan: 'Old', tanggal_kunjungan: '2026-11-01', jam_kunjungan: '10:00', bawa_sppd: true, status_kunjungan: 'Menunggu Konfirmasi' },
        { id: 2, kode_kunjungan: 'TLD-02112026-001', tipe_tamu: 'luar_daerah', instansi: 'Included Nov 2 Local', ketua_nama: 'B', tujuan_bidang: 'Sekretariat', keperluan: 'Valid', tanggal_kunjungan: '2026-11-02', jam_kunjungan: '09:00', bawa_sppd: true, status_kunjungan: 'Menunggu Konfirmasi' }
      ]
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { context, elements } = createAdminHarness((url, opts) => fetch(`${baseUrl}${url}`, opts));
    await context.loadAllDashboard();
    assert.equal(context.getAllTamuData().length, 1);
    assert.match(elements.tamuTableBody.innerHTML, /Included Nov 2 Local/);
    assert.doesNotMatch(elements.tamuTableBody.innerHTML, /Excluded Nov 1 Local/);
    assert.equal(elements.monthlyReportCount.textContent, '1 kunjungan · 11-2026');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
