'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderAdminHtml } = require('../server');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');

const toolsHtml = fs.readFileSync(path.join(__dirname, '../../Admin/Tools.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../../Admin/Index.html'), 'utf8');
const SAMPLE_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

function makeButton(id, pressed) {
  const classes = new Set(pressed ? ['active-filter'] : []);
  const attrs = { 'aria-pressed': pressed ? 'true' : 'false' };
  return {
    id,
    disabled: false,
    classList: {
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
          return classes.has(name);
        }
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      },
      contains(name) {
        return classes.has(name);
      }
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return attrs[name] ?? null;
    }
  };
}

function createToolsHarness(records = [], month = '2026-10') {
  const pagesCreated = [];
  const downloads = [];
  const toasts = [];
  const savedPdfs = [];

  const fields = {
    reportMonth: { value: month },
    monthlyReportCount: { textContent: '' },
    monthlyReportRows: { innerHTML: '' },
    monthlyPdf: { disabled: true },
    monthlyImage: { disabled: true },
    monthlyFilterAll: makeButton('monthlyFilterAll', true),
    monthlyFilterTld: makeButton('monthlyFilterTld', false),
    monthlyFilterTdd: makeButton('monthlyFilterTdd', false)
  };

  function createCanvasStub() {
    const drawnTexts = [];
    const fillRects = [];
    const drawImages = [];
    let isJoined = false;
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      font: '',
      fillRect(x, y, w, h) {
        fillRects.push({ x, y, w, h, fillStyle: ctx.fillStyle });
      },
      strokeRect() {},
      fillText(text, x, y) {
        drawnTexts.push({ text: String(text), x, y });
      },
      measureText(text) {
        return { width: String(text).length * 10 };
      },
      drawImage(img, x, y) {
        isJoined = true;
        drawImages.push({ pageIndex: img._pageIndex, x, y, texts: img._drawnTexts });
      }
    };
    const canvas = {
      width: 0,
      height: 0,
      _drawnTexts: drawnTexts,
      _fillRects: fillRects,
      _drawImages: drawImages,
      _isJoined: () => isJoined,
      getContext() {
        return ctx;
      },
      toDataURL() {
        return SAMPLE_PNG_DATA_URL;
      }
    };
    pagesCreated.push(canvas);
    return canvas;
  }

  class TrackingJsPdf extends jsPDF {
    constructor(options) {
      super(options);
      this._capturedPages = [[]];
      this._savedAs = null;
      const origAddPage = this.addPage.bind(this);
      const origAddImage = this.addImage.bind(this);
      this.addPage = (...args) => {
        this._capturedPages.push([]);
        return origAddPage(...args);
      };
      this.addImage = (...args) => {
        this._capturedPages[this._capturedPages.length - 1].push(args);
        return origAddImage(...args);
      };
      this.save = filename => {
        this._savedAs = filename;
        return this.output('arraybuffer');
      };
      savedPdfs.push(this);
    }
  }

  const context = vm.createContext({
    allTamuData: records,
    escapeHtml: v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])),
    showToast: (...args) => toasts.push(args),
    jspdf: { jsPDF: TrackingJsPdf },
    document: {
      addEventListener() {},
      getElementById: id => fields[id] || null,
      createElement(tag) {
        if (tag === 'canvas') {
          const canvas = createCanvasStub();
          canvas._pageIndex = pagesCreated.length - 1;
          return canvas;
        }
        if (tag === 'a') {
          const anchor = {
            href: '',
            download: '',
            click() {
              downloads.push({ href: anchor.href, download: anchor.download, canvases: pagesCreated.slice() });
            }
          };
          return anchor;
        }
        return {};
      }
    }
  });

  vm.runInContext(toolsHtml.match(/<script>([^]*?)<\/script>/)[1], context);
  return { context, fields, pagesCreated, downloads, toasts, savedPdfs };
}

test('Lainnya renders Semua | TLD | TDD filter buttons defaulting to Semua and hooks mobile table wrapper', () => {
  const html = renderAdminHtml({ baseUrl: 'http://127.0.0.1:4173' });
  const card = html.match(/<div id="monthlyReportCard"[\s\S]*?<\/table>\s*<\/div>\s*<\/div>/i)?.[0] || '';
  assert.ok(card, 'monthlyReportCard section exists');

  const bar = card.match(/<div id="monthlyGuestFilterBar"[\s\S]*?<\/div>/i)?.[0] || '';
  assert.ok(bar, 'monthlyGuestFilterBar exists inside monthlyReportCard');

  const buttons = [...bar.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map(m => ({
    attrs: m[1],
    label: m[2].replace(/<[^>]*>/g, '').trim()
  }));
  assert.deepEqual(buttons.map(b => b.label), ['Semua', 'TLD', 'TDD']);
  assert.match(buttons[0].attrs, /aria-pressed="true"/);
  assert.match(buttons[0].attrs, /active-filter/);
  assert.match(buttons[1].attrs, /aria-pressed="false"/);
  assert.match(buttons[2].attrs, /aria-pressed="false"/);
  assert.match(card, /id="monthlyReportTableWrapper"/);
  assert.doesNotMatch(html, /#monthlyReportCard\s*>\s*div:nth-child\(2\)/);

  // Verify all rendered client scripts parse cleanly without syntax errors.
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  assert.ok(scripts.length >= 2);
  scripts.forEach((scriptBody, i) => {
    assert.doesNotThrow(() => new vm.Script(scriptBody), `rendered script #${i} parses cleanly`);
  });
});

test('filter buttons filter displayed rows consistently, renumber sequentially, preserve sorting, and never infer type from names', () => {
  const records = [
    {
      id: 1,
      kode_kunjungan: 'TDD-25102026-002',
      tipe_tamu: 'dalam_daerah_fo',
      ketua_nama: 'Budi TLD',
      instansi: 'Dinas Luar Daerah',
      keperluan: 'Agenda TDD Pertama',
      tanggal_kunjungan: '2026-10-10',
      jam_kunjungan: '11:00'
    },
    {
      id: 2,
      kode_kunjungan: 'TLD-25102026-001',
      tipe_tamu: 'luar_daerah',
      ketua_nama: 'Sari TDD',
      instansi: 'UMKM Dalam Daerah',
      keperluan: 'Agenda TLD Awal',
      tanggal_kunjungan: '2026-10-05',
      jam_kunjungan: '09:00'
    },
    {
      id: 3,
      kode_kunjungan: 'TLD-25102026-003',
      tipe_tamu: 'luar_daerah',
      ketua_nama: 'Rudi Hartono',
      keperluan: 'Agenda TLD Akhir',
      tanggal_kunjungan: '2026-10-20',
      jam_kunjungan: '08:30'
    },
    {
      id: 4,
      kode_kunjungan: 'TDD-25102026-004',
      tipe_tamu: 'dalam_daerah_fo',
      ketua_nama: 'Dewi Lestari',
      keperluan: 'Agenda TDD Kedua',
      tanggal_kunjungan: '2026-10-15',
      jam_kunjungan: '14:00'
    },
    {
      id: 5,
      kode_kunjungan: '',
      tipe_tamu: '',
      ketua_nama: 'Tamu TLD Tanpa Tipe',
      instansi: 'Dinas Luar Daerah',
      keperluan: 'TDD Konsultasi',
      tanggal_kunjungan: '2026-10-12',
      jam_kunjungan: '10:00'
    },
    {
      id: 6,
      kode_kunjungan: 'TM-LUAR-20261001-001',
      tipe_tamu: '',
      ketua_nama: 'Legacy Luar Tanpa Tipe',
      keperluan: 'Agenda Legacy Luar',
      tanggal_kunjungan: '2026-10-01',
      jam_kunjungan: '08:00'
    },
    {
      id: 7,
      kode_kunjungan: 'TM-FO-20261002-002',
      tipe_tamu: '',
      ketua_nama: 'Legacy Dalam Tanpa Tipe',
      keperluan: 'Agenda Legacy Dalam',
      tanggal_kunjungan: '2026-10-02',
      jam_kunjungan: '08:00'
    }
  ];

  const { context, fields } = createToolsHarness(records, '2026-10');
  context.renderMonthlyReport();

  assert.equal(fields.monthlyFilterAll.getAttribute('aria-pressed'), 'true');
  assert.equal(fields.monthlyReportCount.textContent, '7 kunjungan · 10-2026');
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Legacy Luar Tanpa Tipe') < fields.monthlyReportRows.innerHTML.indexOf('Legacy Dalam Tanpa Tipe'));
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Legacy Dalam Tanpa Tipe') < fields.monthlyReportRows.innerHTML.indexOf('Sari TDD'));
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Sari TDD') < fields.monthlyReportRows.innerHTML.indexOf('Budi TLD'));
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Budi TLD') < fields.monthlyReportRows.innerHTML.indexOf('Tamu TLD Tanpa Tipe'));
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Tamu TLD Tanpa Tipe') < fields.monthlyReportRows.innerHTML.indexOf('Dewi Lestari'));
  assert.ok(fields.monthlyReportRows.innerHTML.indexOf('Dewi Lestari') < fields.monthlyReportRows.innerHTML.indexOf('Rudi Hartono'));

  context.setMonthlyGuestFilter('tld');
  assert.equal(fields.monthlyFilterAll.getAttribute('aria-pressed'), 'false');
  assert.equal(fields.monthlyFilterTld.getAttribute('aria-pressed'), 'true');
  assert.equal(fields.monthlyFilterTdd.getAttribute('aria-pressed'), 'false');
  assert.equal(fields.monthlyReportCount.textContent, '3 kunjungan TLD · 10-2026');
  assert.match(fields.monthlyReportRows.innerHTML, />1<\/td><td[^>]*>Legacy Luar Tanpa Tipe</);
  assert.match(fields.monthlyReportRows.innerHTML, />2<\/td><td[^>]*>Sari TDD</);
  assert.match(fields.monthlyReportRows.innerHTML, />3<\/td><td[^>]*>Rudi Hartono</);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Budi TLD/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Dewi Lestari/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Legacy Dalam Tanpa Tipe/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Tamu TLD Tanpa Tipe/);

  context.setMonthlyGuestFilter('tdd');
  assert.equal(fields.monthlyFilterTld.getAttribute('aria-pressed'), 'false');
  assert.equal(fields.monthlyFilterTdd.getAttribute('aria-pressed'), 'true');
  assert.equal(fields.monthlyReportCount.textContent, '3 kunjungan TDD · 10-2026');
  assert.match(fields.monthlyReportRows.innerHTML, />1<\/td><td[^>]*>Legacy Dalam Tanpa Tipe</);
  assert.match(fields.monthlyReportRows.innerHTML, />2<\/td><td[^>]*>Budi TLD</);
  assert.match(fields.monthlyReportRows.innerHTML, />3<\/td><td[^>]*>Dewi Lestari</);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Sari TDD/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Rudi Hartono/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Legacy Luar Tanpa Tipe/);
  assert.doesNotMatch(fields.monthlyReportRows.innerHTML, /Tamu TLD Tanpa Tipe/);

  // Unknown filters do not alter the active filter.
  context.setMonthlyGuestFilter('unknown');
  assert.equal(fields.monthlyFilterTdd.getAttribute('aria-pressed'), 'true');

  context.setMonthlyGuestFilter('all');
  assert.equal(fields.monthlyFilterAll.getAttribute('aria-pressed'), 'true');
  assert.equal(fields.monthlyReportCount.textContent, '7 kunjungan · 10-2026');
});

test('month and filter combinations preserve active filter, handle empty matches, and remain isolated from Buku Tamu search', async () => {
  const records = [
    {
      kode_kunjungan: 'TLD-01102026-001',
      tipe_tamu: 'luar_daerah',
      ketua_nama: 'Tamu Oktober TLD',
      keperluan: 'Rapat Koordinasi',
      tanggal_kunjungan: '2026-10-01',
      jam_kunjungan: '09:00'
    },
    {
      kode_kunjungan: 'TDD-02112026-001',
      tipe_tamu: 'dalam_daerah_fo',
      ketua_nama: 'Tamu November TDD',
      keperluan: 'Konsultasi Usaha',
      tanggal_kunjungan: '2026-11-02',
      jam_kunjungan: '10:00'
    }
  ];

  const { context, fields, downloads, savedPdfs } = createToolsHarness(records, '2026-10');
  context.setMonthlyGuestFilter('tdd');
  assert.equal(fields.monthlyReportCount.textContent, '0 kunjungan TDD · 10-2026');
  assert.match(fields.monthlyReportRows.innerHTML, /Tidak ada kunjungan TDD pada bulan ini\./);
  assert.equal(fields.monthlyPdf.disabled, true);
  assert.equal(fields.monthlyImage.disabled, true);

  await context.exportMonthlyReport('pdf');
  await context.exportMonthlyReport('image');
  assert.equal(savedPdfs.length, 0);
  assert.equal(downloads.length, 0);

  // Changing month keeps TDD active and reveals November's TDD guest.
  fields.reportMonth.value = '2026-11';
  context.renderMonthlyReport();
  assert.equal(fields.monthlyFilterTdd.getAttribute('aria-pressed'), 'true');
  assert.equal(fields.monthlyReportCount.textContent, '1 kunjungan TDD · 11-2026');
  assert.match(fields.monthlyReportRows.innerHTML, /Tamu November TDD/);
  assert.equal(fields.monthlyPdf.disabled, false);
  assert.equal(fields.monthlyImage.disabled, false);

  // Buku Tamu search state does not leak into Lainnya monthly report.
  const tamuFields = {
    visitSearch: { value: 'TidakAdaKecocokan' },
    visitSearchDate: { value: '' },
    visitStatusFilter: { dataset: { status: '' } },
    tamuTableBody: { innerHTML: '' }
  };
  const tamuCtx = vm.createContext({
    allTamuData: records,
    tamuTableState: { key: null, direction: 'asc' },
    document: { getElementById: id => tamuFields[id] || fields[id] || null, querySelectorAll: () => [] },
    escapeHtml: v => String(v ?? ''),
    formatVisitDateCompact: v => v,
    renderBidangBadges: v => v,
    renderVisitStatus: () => 'Non-SPPD',
    getVisitStatus: () => ({ label: 'Non-SPPD' }),
    renderTableState: (tbody, _c, _t, msg) => { tbody.innerHTML = msg; },
    filterAgendaRecords_: require('../agenda-search').filter
  });
  vm.runInContext(
    indexHtml.slice(indexHtml.indexOf('    function getSortedTamu('), indexHtml.indexOf('    function bukaModalPresensi(')),
    tamuCtx
  );
  tamuCtx.renderTamuTable(records);
  assert.match(tamuFields.tamuTableBody.innerHTML, /Belum ada data kunjungan/);
  context.renderMonthlyReport();
  assert.match(fields.monthlyReportRows.innerHTML, /Tamu November TDD/);
});

test('PDF and PNG exports contain only matching guests, preserving sorting and export layout', async () => {
  const records = [
    {
      kode_kunjungan: 'TDD-20102026-003',
      tipe_tamu: 'dalam_daerah_fo',
      ketua_nama: 'Zara TDD Akhir',
      keperluan: 'Agenda TDD Kedua',
      tanggal_kunjungan: '2026-10-20',
      jam_kunjungan: '13:00'
    },
    {
      kode_kunjungan: 'TLD-10102026-002',
      tipe_tamu: 'luar_daerah',
      ketua_nama: 'Andi TLD Pertama',
      keperluan: 'Agenda TLD Satu',
      tanggal_kunjungan: '2026-10-10',
      jam_kunjungan: '09:00'
    },
    {
      kode_kunjungan: 'TDD-05102026-001',
      tipe_tamu: 'dalam_daerah_fo',
      ketua_nama: 'Bima TDD Awal',
      keperluan: 'Agenda TDD Pertama',
      tanggal_kunjungan: '2026-10-05',
      jam_kunjungan: '08:00'
    },
    {
      kode_kunjungan: 'TLD-25102026-004',
      tipe_tamu: 'luar_daerah',
      ketua_nama: 'Citra TLD Kedua',
      keperluan: 'Agenda TLD Dua',
      tanggal_kunjungan: '2026-10-25',
      jam_kunjungan: '10:30'
    }
  ];

  // Semua PDF & PNG exports preserve existing export title without adding a category label
  for (const format of ['pdf', 'image']) {
    const { context, pagesCreated, savedPdfs, downloads, toasts } = createToolsHarness(records, '2026-10');
    await context.exportMonthlyReport(format);

    assert.equal(toasts.filter(t => t[0] === 'error').length, 0);
    if (format === 'pdf') {
      assert.equal(savedPdfs.length, 1);
      assert.equal(savedPdfs[0]._savedAs, 'Laporan_Tamu_10-2026.pdf');
      const pdfMeta = Buffer.from(savedPdfs[0].output('arraybuffer')).toString('latin1');
      assert.match(pdfMeta, /\/Title \(Laporan Tamu Bulanan\)/);
    } else {
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].download, 'Laporan_Tamu_10-2026.png');
    }

    const texts = pagesCreated[0]._drawnTexts.map(t => t.text);
    assert.equal(texts[0], 'Laporan Tamu Bulanan');
    assert.ok(!texts.some(t => /Tamu Luar Daerah|Tamu Dalam Daerah/.test(t)));
    assert.ok(texts.includes('SI-TARI DISKUM · 10-2026'));
    assert.ok(texts.includes('4 kunjungan'));
    assert.ok(texts.indexOf('Bima TDD Awal') < texts.indexOf('Andi TLD Pertama'));
    assert.ok(texts.indexOf('Andi TLD Pertama') < texts.indexOf('Zara TDD Akhir'));
    assert.ok(texts.indexOf('Zara TDD Akhir') < texts.indexOf('Citra TLD Kedua'));
  }

  // TLD PDF & PNG exports include "Tamu Luar Daerah (TLD)" as export title and only TLD guests
  for (const format of ['pdf', 'image']) {
    const { context, pagesCreated, savedPdfs, downloads, toasts } = createToolsHarness(records, '2026-10');
    context.setMonthlyGuestFilter('tld');
    await context.exportMonthlyReport(format);

    assert.equal(toasts.filter(t => t[0] === 'error').length, 0);
    if (format === 'pdf') {
      assert.equal(savedPdfs.length, 1);
      assert.equal(savedPdfs[0]._savedAs, 'Laporan_Tamu_10-2026_TLD.pdf');
      assert.equal(savedPdfs[0].getNumberOfPages(), 1);
      const pdfBytes = Buffer.from(savedPdfs[0].output('arraybuffer'));
      assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
      assert.match(pdfBytes.toString('latin1'), /\/Title \(Laporan Tamu Bulanan - Tamu Luar Daerah \\\(TLD\\\)\)/);
    } else {
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].download, 'Laporan_Tamu_10-2026_TLD.png');
    }
    assert.equal(pagesCreated.length, 1);

    const texts = pagesCreated[0]._drawnTexts.map(t => t.text);
    assert.equal(texts[0], 'Laporan Tamu Bulanan - Tamu Luar Daerah (TLD)');
    assert.ok(texts[0].includes('Tamu Luar Daerah (TLD)'));
    assert.ok(texts.includes('SI-TARI DISKUM · 10-2026'));
    assert.ok(texts.includes('No.'));
    assert.ok(texts.includes('Nama Ketua Rombongan'));
    assert.ok(texts.includes('Agenda'));
    assert.ok(texts.includes('2 kunjungan'));
    assert.ok(texts.includes('1 / 1'));
    assert.ok(texts.indexOf('Andi TLD Pertama') < texts.indexOf('Citra TLD Kedua'));
    assert.ok(!texts.some(t => /TDD/.test(t)));
  }

  // TDD PDF & PNG exports include "Tamu Dalam Daerah (TDD)" as export title and only TDD guests
  for (const format of ['pdf', 'image']) {
    const { context, pagesCreated, savedPdfs, downloads, toasts } = createToolsHarness(records, '2026-10');
    context.setMonthlyGuestFilter('tdd');
    await context.exportMonthlyReport(format);

    assert.equal(toasts.filter(t => t[0] === 'error').length, 0);
    if (format === 'pdf') {
      assert.equal(savedPdfs.length, 1);
      assert.equal(savedPdfs[0]._savedAs, 'Laporan_Tamu_10-2026_TDD.pdf');
      assert.equal(savedPdfs[0].getNumberOfPages(), 1);
      const pdfMeta = Buffer.from(savedPdfs[0].output('arraybuffer')).toString('latin1');
      assert.match(pdfMeta, /\/Title \(Laporan Tamu Bulanan - Tamu Dalam Daerah \\\(TDD\\\)\)/);
    } else {
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].download, 'Laporan_Tamu_10-2026_TDD.png');
    }
    assert.equal(pagesCreated.length, 1);

    const texts = pagesCreated[0]._drawnTexts.map(t => t.text);
    assert.equal(texts[0], 'Laporan Tamu Bulanan - Tamu Dalam Daerah (TDD)');
    assert.ok(texts[0].includes('Tamu Dalam Daerah (TDD)'));
    assert.ok(texts.includes('SI-TARI DISKUM · 10-2026'));
    assert.ok(texts.includes('2 kunjungan'));
    assert.ok(texts.indexOf('Bima TDD Awal') < texts.indexOf('Zara TDD Akhir'));
    assert.ok(!texts.some(t => /TLD/.test(t)));
  }
});

test('multi-page PDF and PNG exports contain only matching filtered guests across every page', async () => {
  const records = [];
  for (let i = 1; i <= 90; i++) {
    const day = String(((i - 1) % 28) + 1).padStart(2, '0');
    const hour = String(8 + Math.floor((i - 1) / 28)).padStart(2, '0');
    const isTld = i % 2 === 1;
    records.push({
      id: i,
      kode_kunjungan: `${isTld ? 'TLD' : 'TDD'}-${day}102026-${String(i).padStart(3, '0')}`,
      tipe_tamu: isTld ? 'luar_daerah' : 'dalam_daerah_fo',
      ketua_nama: `${isTld ? 'Ketua Luar' : 'Ketua Dalam'} ${String(i).padStart(2, '0')}`,
      keperluan: `${isTld ? 'Agenda Luar' : 'Agenda Dalam'} ${String(i).padStart(2, '0')}`,
      tanggal_kunjungan: `2026-10-${day}`,
      jam_kunjungan: `${hour}:00`
    });
  }

  // 45 TLD rows span multiple A4 pages in PDF export.
  {
    const { context, pagesCreated, savedPdfs, toasts } = createToolsHarness(records, '2026-10');
    context.setMonthlyGuestFilter('tld');
    await context.exportMonthlyReport('pdf');

    assert.equal(toasts.filter(t => t[0] === 'error').length, 0);
    assert.ok(pagesCreated.length > 1, 'expected multi-page PDF canvas output');
    assert.equal(savedPdfs[0]._savedAs, 'Laporan_Tamu_10-2026_TLD.pdf');
    assert.equal(savedPdfs[0].getNumberOfPages(), pagesCreated.length);
    assert.equal(savedPdfs[0]._capturedPages.length, pagesCreated.length);
    pagesCreated.forEach((page, idx) => {
      const texts = page._drawnTexts.map(t => t.text);
      assert.equal(texts[0], 'Laporan Tamu Bulanan - Tamu Luar Daerah (TLD)');
      assert.ok(texts.includes('45 kunjungan'));
      assert.ok(texts.includes(`${idx + 1} / ${pagesCreated.length}`));
      assert.ok(!texts.some(t => /Ketua Dalam|Agenda Dalam/.test(t)), `unexpected TDD text on page ${idx + 1}`);
    });
    const allTexts = pagesCreated.flatMap(p => p._drawnTexts.map(t => t.text));
    assert.ok(allTexts.includes('Ketua Luar 01'));
    assert.ok(allTexts.includes('Ketua Luar 89'));
    assert.ok(allTexts.includes('45'));
  }

  // 45 TDD rows span multiple pages and join cleanly into a single PNG when height <= 16000.
  {
    const { context, pagesCreated, downloads } = createToolsHarness(records, '2026-10');
    context.setMonthlyGuestFilter('tdd');
    await context.exportMonthlyReport('image');

    const pageCanvases = pagesCreated.filter(c => !c._isJoined());
    const joinedCanvases = pagesCreated.filter(c => c._isJoined());
    assert.ok(pageCanvases.length > 1);
    assert.equal(joinedCanvases.length, 1);
    assert.equal(joinedCanvases[0]._drawImages.length, pageCanvases.length);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].download, 'Laporan_Tamu_10-2026_TDD.png');
    pageCanvases.forEach((page, idx) => {
      const texts = page._drawnTexts.map(t => t.text);
      assert.equal(texts[0], 'Laporan Tamu Bulanan - Tamu Dalam Daerah (TDD)');
      assert.ok(texts.includes('45 kunjungan'));
      assert.ok(texts.includes(`${idx + 1} / ${pageCanvases.length}`));
      assert.ok(!texts.some(t => /Ketua Luar|Agenda Luar/.test(t)), `unexpected TLD text on page ${idx + 1}`);
    });
  }

  // Very long agendas (>16000px total height) split into numbered PNGs, still keeping only matching guests on every page.
  {
    const longRecords = records.slice(0, 20).map((r, idx) => ({
      ...r,
      keperluan: (r.tipe_tamu === 'luar_daerah' ? 'Uraian panjang luar ' : 'Uraian panjang dalam ') + 'detail '.repeat(idx % 2 === 0 ? 450 : 10)
    }));
    const { context, pagesCreated, downloads } = createToolsHarness(longRecords, '2026-10');
    context.setMonthlyGuestFilter('tld');
    await context.exportMonthlyReport('image');

    assert.ok(pagesCreated.length * 1754 > 16000);
    assert.equal(downloads.length, pagesCreated.length);
    assert.equal(downloads[0].download, 'Laporan_Tamu_10-2026_TLD_1.png');
    assert.equal(downloads.at(-1).download, `Laporan_Tamu_10-2026_TLD_${pagesCreated.length}.png`);
    pagesCreated.forEach(page => {
      const texts = page._drawnTexts.map(t => t.text);
      assert.equal(texts[0], 'Laporan Tamu Bulanan - Tamu Luar Daerah (TLD)');
      assert.ok(texts.includes('10 kunjungan'));
      assert.ok(!texts.some(t => /Ketua Dalam|Uraian panjang dalam/.test(t)));
    });
  }
});
