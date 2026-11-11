'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const vm = require('node:vm');
const { createLocalTestServer, renderAdminHtml } = require('../server');
const { testDocument } = require('./tld-test-data');
const { completeTddPayload } = require('./tdd-test-data');
const { completeMeetingPayload } = require('./meeting-test-data');

const FIXED_NOW = new Date('2026-10-24T18:30:00.000Z');

async function withServer(run) {
  const server = createLocalTestServer({ now: FIXED_NOW });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function postJson(baseUrl, functionName, body = {}) {
  return fetch(`${baseUrl}/api/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('renders Admin HTML with local URLs and no GAS template tags', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });

  assert.match(html, /<style>/);
  assert.match(html, /http:\/\/127\.0\.0\.1:4173\/tamu-fo/);
  assert.match(html, /http:\/\/127\.0\.0\.1:4173\/tamu-luar/);
  assert.doesNotMatch(html, /<\?|\?>/);
});

test('renders the approved SI-TARI header and uniform dashboard summary presentation', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const header = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] || '';
  const kpiSection = html.match(/<!-- KPI METRIC CARDS -->([\s\S]*?)<!-- RAPAT HARI INI -->/i)?.[1] || '';

  assert.match(html, /<title>SI-TARI DISKUM<\/title>/);
  assert.match(header, />SI-TARI DISKUM<\/h1>/);
  assert.match(header, /Sistem Informasi Tamu &amp; Rapat Internal Dinas Koperasi dan Usaha Mikro/);
  assert.match(header, /upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/5\/53\/Lambang_Kota_Batam\.png\/250px-Lambang_Kota_Batam\.png/);
  assert.match(header, /alt="Lambang Kota Batam"/);
  assert.doesNotMatch(header, /Cloud Edition/);
  assert.doesNotMatch(header, /desktop-header-actions|mobile-quick-actions/);
  assert.doesNotMatch(html, /headerRefreshData|headerRefreshIcon|refreshHeaderData/);

  assert.match(html, /onclick="openFormTamuLuarTab\(\)"/);
  assert.match(html, /onclick="openFormTamuFoTab\(\)"/);
  assert.doesNotMatch(kpiSection, /hover:shadow-md/);
  for (const id of ['statTamuHariIni', 'statTamuLuar', 'statTamuFo', 'statRapatHariIni', 'statSppdBelumLengkap']) {
    assert.match(kpiSection, new RegExp(`id="${id}" class="[^"]*text-2xl`), id);
  }

  assert.match(html, />Kunjungan terbaru yang tercatat<\/p>/);
  assert.match(html, /onclick="switchTab\('tamu'\)"[^>]*>Semua<\/button>/);
  assert.doesNotMatch(html, /Buka Seluruh Buku Tamu|Data terurut otomatis/);
});

test('renders canonical navigation titles on desktop and mobile', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const expectedTabs = [
    ['dashboard', 'Dashboard'],
    ['tamu', 'Buku Tamu'],
    ['calendar', 'Jadwal Rapat'],
    ['qrcode', 'Lainnya']
  ];

  assert.doesNotMatch(html, /id="(?:tab-sppd|mobile-tab-sppd|section-sppd|sppdPendingBadge|mobileSppdPendingBadge)"/);
  assert.doesNotMatch(html, /switchTab\('sppd'\)/);

  for (const [target, label] of expectedTabs) {
    const desktopButton = html.match(new RegExp(`<button[^>]*id="tab-${target}"[\\s\\S]*?<\\/button>`))?.[0] || '';
    const mobileButton = html.match(new RegExp(`<button[^>]*id="mobile-tab-${target}"[\\s\\S]*?<\\/button>`))?.[0] || '';

    assert.match(desktopButton, new RegExp(`switchTab\\('${target}'\\)`), `desktop ${target} target`);
    assert.ok(desktopButton.includes(label), `desktop ${target} label`);
    assert.match(mobileButton, new RegExp(`switchTab\\('${target}'\\)`), `mobile ${target} target`);
    assert.ok(mobileButton.includes(`<span>${label}</span>`), `mobile ${target} label`);
    assert.ok(mobileButton.includes(`aria-label="${label}"`), `mobile ${target} accessibility label`);
  }
});

test('renders the revised Buku Tamu contract and compact visit dates', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const section = html.match(/<section id="section-tamu"[\s\S]*?<\/section>/i)?.[0] || '';
  const expectedHeadings = [
    'ID &amp; Waktu',
    'Asal Instansi / Pengunjung',
    'Detail Tamu &amp; Kontak',
    'Bidang Tujuan &amp; Agenda',
    'Penerima Tamu',
    'Status',
    'Aksi'
  ];
  const expectedMobileLabels = [
    'ID & Waktu',
    'Asal Instansi / Pengunjung',
    'Detail Tamu & Kontak',
    'Bidang Tujuan & Agenda',
    'Penerima Tamu',
    'Status',
    'Aksi'
  ];

  assert.match(section, /fa-solid fa-users[^<]*<\/i> Buku Tamu/);
  assert.match(section, /Pengelolaan kunjungan tamu luar daerah dan dalam daerah\./);
  assert.match(section, /onclick="openFormTamuLuarTab\(\)"[\s\S]*?Form Tamu Luar Daerah/);
  assert.match(section, /onclick="openFormTamuFoTab\(\)"[\s\S]*?Form Tamu Dalam Daerah/);
  const headings = [...section.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
    .map(match => match[1].replace(/<span class="tamu-sort-icon"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<br\s*\/?\s*>/g, ' ').replace(/<[^>]*>/g, '').trim());
  assert.deepEqual(headings, expectedHeadings);
  expectedMobileLabels.forEach((label, index) => {
    assert.ok(
      html.includes(`#tamuTableWrapper td:nth-child(${index + 1})::before { content: "${label}"; }`),
      `mobile ${label}`
    );
  });

  const formatterSource = html.match(/function formatVisitDateCompact\(value\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.ok(formatterSource, 'formatVisitDateCompact exists');
  const formatVisitDateCompact = vm.runInNewContext(`(${formatterSource})`);
  assert.equal(formatVisitDateCompact('2026-10-25'), '25-10-2026');
  assert.equal(formatVisitDateCompact('2026-10-25T13:45:00.000Z'), '25-10-2026');
  assert.equal(formatVisitDateCompact(''), '-');
  assert.equal(formatVisitDateCompact('Belum dijadwalkan'), 'Belum dijadwalkan');
});

test('centers and balances every Buku Tamu desktop column heading', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });

  assert.match(
    html,
    /#tamuTableWrapper thead th\s*\{[^}]*text-align:\s*center;[^}]*vertical-align:\s*middle;[^}]*text-wrap:\s*balance;/s
  );
});

test('serves the Admin and Presensi pages locally', async () => {
  await withServer(async baseUrl => {
    const adminResponse = await fetch(`${baseUrl}/`);
    const adminHtml = await adminResponse.text();
    const presensiResponse = await fetch(`${baseUrl}/?page=presensi`);
    const presensiHtml = await presensiResponse.text();

    assert.equal(adminResponse.status, 200);
    assert.match(adminHtml, /<title>SI-TARI DISKUM<\/title>/);
    assert.doesNotMatch(adminHtml, /<\?|\?>/);
    assert.equal(presensiResponse.status, 200);
    assert.match(presensiHtml, /Presensi/);
  });
});

test('serves both standalone guest forms from their Admin button routes', async () => {
  await withServer(async baseUrl => {
    const foResponse = await fetch(`${baseUrl}/tamu-fo`);
    const foHtml = await foResponse.text();
    const luarResponse = await fetch(`${baseUrl}/tamu-luar`);
    const luarHtml = await luarResponse.text();

    assert.equal(foResponse.status, 200);
    assert.match(foHtml, /id="formTamuFo"/);
    assert.match(foHtml, /fetch\('\/api\/registerTamuFo'/);
    assert.equal(luarResponse.status, 200);
    assert.match(luarHtml, /id="formTamuLuar"/);
    assert.match(luarHtml, /fetch\('\/api\/registerTamuLuar'/);
  });
});

test('serves every read endpoint with successful dummy responses', async () => {
  await withServer(async baseUrl => {
    const functions = [
      'getDashboardData',
      'getDashboardSummary',
      'getTamuList',
      'getRapatCalendar',
      'getSppdList',
      'getMasterData'
    ];

    for (const functionName of functions) {
      const response = await postJson(baseUrl, functionName);
      const payload = await response.json();
      assert.equal(response.status, 200, functionName);
      assert.equal(payload.success, true, functionName);
    }
  });
});

test('returns controlled errors for malformed JSON and unknown functions', async () => {
  await withServer(async baseUrl => {
    const malformed = await fetch(`${baseUrl}/api/getTamuList`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    });
    const malformedPayload = await malformed.json();
    const unknown = await postJson(baseUrl, 'unknownFunction');
    const unknownPayload = await unknown.json();

    assert.equal(malformed.status, 400);
    assert.equal(malformedPayload.success, false);
    assert.equal(unknown.status, 404);
    assert.equal(unknownPayload.success, false);
  });
});

test('returns structured JSON when the request body exceeds the local limit', async () => {
  await withServer(async baseUrl => {
    const oversized = await fetch(`${baseUrl}/api/getTamuList`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) })
    });
    const payload = await oversized.json();

    assert.equal(oversized.status, 413);
    assert.equal(payload.success, false);
    assert.match(payload.error, /too large/i);
  });
});

test('simulates the two allowed mutations locally', async () => {
  await withServer(async baseUrl => {
    const meeting = await postJson(baseUrl, 'simpanJadwalRapat', completeMeetingPayload({ judul: '[DUMMY] Uji rapat', jam_mulai:'11:00', jam_selesai:'12:00' }));
    const meetingPayload = await meeting.json();
    const attendance = await postJson(baseUrl, 'submitPresensiRapat', { nama: '[DUMMY] Penguji' });
    const attendancePayload = await attendance.json();

    assert.equal(meeting.status, 200);
    assert.equal(meetingPayload.success, true);
    assert.match(meetingPayload.message, /simulasi lokal/i);
    assert.equal(attendance.status, 200);
    assert.equal(attendancePayload.success, true);
    assert.match(attendancePayload.message, /simulasi lokal/i);
  });
});

test('adds local TDD and TLD submissions to the Admin visitor data', async () => {
  await withServer(async baseUrl => {
    const initial=(await (await postJson(baseUrl,'getTamuList')).json()).data;
    const serial=Math.max(0,...initial.map(v=>/^(?:TLD|TDD)-\d{2}102026-(\d+)$/.exec(v.kode_kunjungan)).filter(Boolean).map(m=>Number(m[1])));
    const foCode='TDD-25102026-'+String(serial+1).padStart(3,'0'),luarCode='TLD-26102026-'+String(serial+2).padStart(3,'0');
    const foResponse = await postJson(baseUrl, 'registerTamuFo', {
      ketua_nama: 'Pengunjung Lokal FO',
      pengikut_list: 'Pengunjung Lokal FO',
      jumlah_orang: '1',
      instansi: 'UMKM Pengujian Lokal',
      narahubung_hp: '081234567890',
      alamat: 'Batam Centre',
      tujuan_bidang: ['Bidang Pengawasan Koperasi'],
      keperluan: 'Pengujian formulir TDD',
      bawa_sppd: 0
    });
    const foPayload = await foResponse.json();
    const luarResponse = await postJson(baseUrl, 'registerTamuLuar', {
      instansi: 'Dinas Pengujian Luar Daerah',
      alamat: 'Tanjungpinang',
      jumlah_orang: '3',
      ketua_nama: 'Ketua Pengujian TLD',
      pengikut_list: 'Anggota Satu, Anggota Dua',
      tujuan_bidang: ['Bidang Pengembangan Usaha Mikro', 'Sekretariat (Umum dan Kepegawaian)'],
      keperluan: 'Pengujian formulir TLD',
      tanggal_kunjungan: '2026-10-26',
      jam_kunjungan: '09:00',
      narahubung_hp: '081298765432',
      bawa_sppd: 1,
      surat_kunjungan_base64: testDocument,
      surat_tugas_base64: testDocument
    });
    const luarPayload = await luarResponse.json();
    const listPayload = await (await postJson(baseUrl, 'getTamuList')).json();
    const dashboardPayload = await (await postJson(baseUrl, 'getDashboardData')).json();

    assert.equal(foPayload.success, true);
    assert.deepEqual(foPayload.data, {
      kode_kunjungan: foCode,
      tujuan_bidang: 'Bidang Pengawasan Koperasi',
      lo_nama: 'Mery Sefina Simor, S.Kom.'
    });
    assert.equal(luarPayload.success, true);
    assert.deepEqual(luarPayload.data, {
      kode_kunjungan: luarCode,
      tujuan_bidang: '',
      lo_nama: ''
    });
    assert.equal(listPayload.data.length, 22);
    assert.equal(listPayload.data[0].kode_kunjungan, luarCode);
    assert.equal(listPayload.data[1].kode_kunjungan, foCode);
    assert.equal(listPayload.data[1].ketua_nama, 'Pengunjung Lokal FO');
    assert.equal(listPayload.data[1].pengikut_list, 'Pengunjung Lokal FO');
    assert.equal(dashboardPayload.data.stats.totalTamu, 22);
    assert.equal(dashboardPayload.data.stats.tamuHariIni, 1);
    assert.equal(dashboardPayload.data.recentTamu[0].kode_kunjungan, luarCode);
  });
});

test('refreshes the open local Admin when a guest is submitted in another tab', async () => {
  await withServer(async baseUrl => {
    const html = await (await fetch(baseUrl)).text();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    let tick;
    let reloads = 0;
    vm.runInNewContext(scripts.at(-1)[1], {
      document: { hidden: false, addEventListener() {} },
      window: { addEventListener() {}, setInterval(callback) { tick = callback; } },
      fetch: (url, options) => fetch(baseUrl + url, options),
      loadAllDashboard() { reloads++; }
    });
    await tick();
    assert.equal(reloads, 1);
    await tick();
    assert.equal(reloads, 1, 'unchanged visitor list does not reload panels');
    await postJson(baseUrl, 'registerTamuFo', completeTddPayload({ ketua_nama: '[DUMMY] Auto refresh' }));
    await tick();
    assert.equal(reloads, 2, 'new visitor triggers panel refresh');
  });
});
