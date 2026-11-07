'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFixtureStore } = require('../fixtures');
const { completeTldPayload } = require('./tld-test-data');
const { completeTddPayload } = require('./tdd-test-data');
const { completeMeetingPayload } = require('./meeting-test-data');

const FIXED_NOW = new Date('2026-10-24T18:30:00.000Z');

test('uses the Jakarta calendar date for dashboard records', () => {
  const store = createFixtureStore(FIXED_NOW);
  const dashboard = store.responses.getDashboardData.data;

  assert.equal(dashboard.todayMeetings.length, 1);
  assert.equal(dashboard.todayMeetings[0].tanggal, '2026-10-25');
  assert.equal(dashboard.stats.tamuHariIni, 2);
  assert.equal(dashboard.stats.rapatHariIni, 1);
});

test('provides coherent FO and outside visitor statistics', () => {
  const store = createFixtureStore(FIXED_NOW);
  const visitors = store.responses.getTamuList.data;
  const stats = store.responses.getDashboardData.data.stats;

  assert.equal(visitors.length, 5);
  assert.equal(visitors.filter(item => item.tipe_tamu === 'luar_daerah').length, 3);
  assert.equal(visitors.filter(item => item.tipe_tamu === 'dalam_daerah_fo').length, 2);
  assert.deepEqual(stats, {
    totalTamu: 5,
    tamuHariIni: 2,
    tamuLuar: 3,
    tamuFo: 2,
    rapatHariIni: 1,
    sppd: { total: 3, belumLengkap: 1, sah: 1 }
  });
});

test('covers incomplete, pending, and verified SPPD states', () => {
  const store = createFixtureStore(FIXED_NOW);
  const statuses = store.responses.getSppdList.data.map(item => item.status_sppd);

  assert.deepEqual(statuses, [
    'Belum Lengkap',
    'Menunggu Validasi Teknis',
    'Sah & Terverifikasi'
  ]);
});

test('uses natural fictional records without visible dummy markers and keeps IDs unique', () => {
  const store = createFixtureStore(FIXED_NOW);
  const visitors = store.responses.getTamuList.data;
  const meetings = store.responses.getRapatCalendar.data;
  const masters = store.responses.getMasterData.data;

  assert.doesNotMatch(JSON.stringify([visitors,meetings,masters,store.responses.getSppdList]),/dummy/i);
  visitors.forEach(item=>assert.match(item.kode_kunjungan,/^(TLD|TDD)-\d{8}-\d{3}$/));
  assert.equal(new Set(visitors.map(v=>v.kode_kunjungan)).size,visitors.length);
  store.responses.getSppdList.data.forEach(item=>assert.ok(visitors.some(v=>v.kode_kunjungan===item.kode_kunjungan&&v.tipe_tamu==='luar_daerah')));
  assert.deepEqual(masters.ruangan.map(item => item.nama_ruangan), ['Ruang Rapat Utama Diskum', 'Ruangan Bidang Koperasi & UMKM', 'Ruang Rapat Pimpinan / Kadis', 'Ruangan Rapat UPTD PLUT KUMKM']);
});

test('simulates allowed mutations within the isolated local store', () => {
  const store = createFixtureStore(FIXED_NOW);
  const meeting = store.handleMutation('simpanJadwalRapat', completeMeetingPayload({ judul: 'Uji lokal' }));
  const attendance = store.handleMutation('submitPresensiRapat', { nama: 'Penguji' });

  assert.equal(meeting.success, true);
  assert.match(meeting.message, /simulasi lokal/i);
  assert.match(meeting.data.kode_rapat, /^RPT-/);
  assert.equal(attendance.success, true);
  assert.match(attendance.message, /simulasi lokal/i);
  assert.equal(store.handleMutation('unknownMutation', {}), null);
});

test('uses submission time across Jakarta midnight and resets the shared monthly sequence', () => {
  let time = new Date('2026-10-31T16:59:00Z');
  const store = createFixtureStore(() => time);
  assert.equal(store.handleMutation('registerTamuFo', completeTddPayload()).data.kode_kunjungan, 'TDD-31102026-006');
  time = new Date('2026-10-31T17:01:00Z');
  const fo = store.handleMutation('registerTamuFo', completeTddPayload());
  assert.equal(fo.data.kode_kunjungan, 'TDD-01112026-001');
  assert.equal(store.responses.getTamuList.data[0].jam_kunjungan, '00:01');
  const luar = store.handleMutation('registerTamuLuar', completeTldPayload({ tanggal_kunjungan: '2026-11-02', tujuan_bidang: ['Bidang Pengembangan Usaha Mikro'] }));
  assert.equal(luar.data.kode_kunjungan, 'TLD-02112026-002');
  assert.equal(createFixtureStore(time).responses.getTamuList.data.length, 5, 'new server store resets submissions');
});

test('rejects invalid TLD dates without adding a visitor', () => {
  const store = createFixtureStore(FIXED_NOW);
  for (const tanggal_kunjungan of ['', '2026-02-30', 'invalid']) {
    assert.equal(store.handleMutation('registerTamuLuar', completeTldPayload({ tanggal_kunjungan, tujuan_bidang: ['Bidang Pengembangan Usaha Mikro'] })).success, false);
  }
  assert.equal(store.responses.getTamuList.data.length, 5);
});
