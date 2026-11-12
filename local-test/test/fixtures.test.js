'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFixtureStore } = require('../fixtures');
const { completeTldPayload } = require('./tld-test-data');
const { completeTddPayload } = require('./tdd-test-data');
const { completeMeetingPayload } = require('./meeting-test-data');

const FIXED_NOW = new Date('2026-11-04T18:30:00.000Z'); // 2026-11-05 01:30 Asia/Jakarta

function buildTestSeed({ today, yesterday }) {
  const toCodeDate = d => d.split('-').reverse().join('');
  return ({ visitors, meetings, sppd, previewDocument }) => {
    visitors.push(
      {
        id: 9001,
        kode_kunjungan: `TLD-${toCodeDate(today)}-003`,
        tipe_tamu: 'luar_daerah',
        instansi: 'Dinas Koperasi Daerah Uji 1',
        alamat: 'Batam',
        jumlah_orang: 4,
        ketua_nama: 'Ketua Uji 1',
        pengikut_list: 'Anggota 1',
        tujuan_bidang: 'Bidang Pengawasan Koperasi',
        keperluan: 'Konsultasi',
        narahubung_hp: '081200000001',
        tanggal_kunjungan: today,
        jam_kunjungan: '09:00',
        lo_nama: 'Mery Sefina Simor, S.Kom.',
        bawa_sppd: true,
        status_kunjungan: 'Menunggu Konfirmasi'
      },
      {
        id: 9002,
        kode_kunjungan: `TDD-${toCodeDate(today)}-004`,
        tipe_tamu: 'dalam_daerah_fo',
        instansi: 'Koperasi Uji 2',
        alamat: 'Batam',
        jumlah_orang: 1,
        ketua_nama: 'Ketua Uji 2',
        pengikut_list: 'Ketua Uji 2',
        tujuan_bidang: 'Sekretariat',
        keperluan: 'Layanan',
        narahubung_hp: '081200000002',
        tanggal_kunjungan: today,
        jam_kunjungan: '10:00',
        lo_nama: 'PIC Sekretariat',
        bawa_sppd: false,
        status_kunjungan: 'Non-SPPD'
      },
      {
        id: 9003,
        kode_kunjungan: `TLD-${toCodeDate(yesterday)}-001`,
        tipe_tamu: 'luar_daerah',
        instansi: 'Dinas Koperasi Daerah Uji 3',
        alamat: 'Bintan',
        jumlah_orang: 2,
        ketua_nama: 'Ketua Uji 3',
        pengikut_list: 'Anggota 3',
        tujuan_bidang: 'Bidang Kewirausahaan',
        keperluan: 'Koordinasi',
        narahubung_hp: '081200000003',
        tanggal_kunjungan: yesterday,
        jam_kunjungan: '11:00',
        lo_nama: 'Febri Yanti',
        bawa_sppd: true,
        status_kunjungan: 'Kelola SPPD'
      },
      {
        id: 9004,
        kode_kunjungan: `TDD-${toCodeDate(yesterday)}-002`,
        tipe_tamu: 'dalam_daerah_fo',
        instansi: 'UMKM Uji 4',
        alamat: 'Batam',
        jumlah_orang: 1,
        ketua_nama: 'Ketua Uji 4',
        pengikut_list: 'Ketua Uji 4',
        tujuan_bidang: 'Sekretariat',
        keperluan: 'Informasi',
        narahubung_hp: '081200000004',
        tanggal_kunjungan: yesterday,
        jam_kunjungan: '14:00',
        lo_nama: 'PIC Sekretariat',
        bawa_sppd: false,
        status_kunjungan: 'Non-SPPD'
      },
      {
        id: 9005,
        kode_kunjungan: `TLD-${toCodeDate(yesterday)}-005`,
        tipe_tamu: 'luar_daerah',
        instansi: 'Dinas Koperasi Daerah Uji 5',
        alamat: 'Karimun',
        jumlah_orang: 3,
        ketua_nama: 'Ketua Uji 5',
        pengikut_list: 'Anggota 5',
        tujuan_bidang: 'UPTD PLUT KUMKM',
        keperluan: 'Kaji Tiru',
        narahubung_hp: '081200000005',
        tanggal_kunjungan: yesterday,
        jam_kunjungan: '15:00',
        lo_nama: 'Hafidz Qodli Abdillah, S.E.',
        bawa_sppd: true,
        status_kunjungan: 'Selesai'
      }
    );

    visitors.filter(v => v.tipe_tamu === 'luar_daerah').forEach(v => {
      v.surat_kunjungan_file = previewDocument('Surat Permohonan Kunjungan', v).url;
      v.surat_tugas_file = previewDocument('Surat Tugas Rombongan', v).url;
    });

    meetings.push(
      {
        id: 7001,
        kode_rapat: `RPT-${today.replaceAll('-', '')}-001`,
        judul_rapat: 'Rapat Uji Hari Ini',
        ruangan_id: 6001,
        nama_ruangan: 'Ruang Rapat Utama Diskum',
        tanggal: today,
        jam_mulai: '09:00',
        jam_selesai: '11:00',
        penyelenggara_bidang: 'Sekretariat',
        pimpinan_rapat: 'Adrial, S.K.M, M.K.M.',
        jumlah_peserta: 10,
        agenda: 'Koordinasi',
        status: 'Terjadwal'
      },
      {
        id: 7002,
        kode_rapat: `RPT-${yesterday.replaceAll('-', '')}-001`,
        judul_rapat: 'Rapat Uji Kemarin',
        ruangan_id: 6002,
        nama_ruangan: 'Ruangan Bidang Koperasi & UMKM',
        tanggal: yesterday,
        jam_mulai: '13:00',
        jam_selesai: '14:30',
        penyelenggara_bidang: 'Bidang Koperasi',
        pimpinan_rapat: 'Kepala Bidang',
        jumlah_peserta: 5,
        agenda: 'Evaluasi',
        status: 'Selesai'
      }
    );

    sppd.push(
      { id: 5001, tamu_id: 9001, kode_kunjungan: visitors[0].kode_kunjungan, instansi: visitors[0].instansi, ketua_nama: visitors[0].ketua_nama, file_foto: '', file_absen: '', file_notulen: '', status_sppd: 'Belum Lengkap' },
      { id: 5002, tamu_id: 9003, kode_kunjungan: visitors[2].kode_kunjungan, instansi: visitors[2].instansi, ketua_nama: visitors[2].ketua_nama, file_foto: '/local-doc/f1', file_absen: '/local-doc/a1', file_notulen: '/local-doc/n1', status_sppd: 'Menunggu Validasi Teknis' },
      { id: 5003, tamu_id: 9005, kode_kunjungan: visitors[4].kode_kunjungan, instansi: visitors[4].instansi, ketua_nama: visitors[4].ketua_nama, file_foto: '/local-doc/f2', file_absen: '/local-doc/a2', file_notulen: '/local-doc/n2', status_sppd: 'Sah & Terverifikasi', disetujui_kasubag: 1, waktu_persetujuan_kasubag: `${yesterday} 16:05:00` }
    );
  };
}

test('default local store starts completely empty without hardcoded dummy records', () => {
  const store = createFixtureStore(FIXED_NOW);
  const dashboard = store.responses.getDashboardData.data;

  assert.deepEqual(dashboard.stats, {
    totalTamu: 0,
    tamuHariIni: 0,
    tamuLuar: 0,
    tamuFo: 0,
    rapatHariIni: 0,
    sppd: { total: 0, belumLengkap: 0, sah: 0 }
  });
  assert.deepEqual(dashboard.recentTamu, []);
  assert.deepEqual(dashboard.todayMeetings, []);
  assert.deepEqual(store.responses.getTamuList.data, []);
  assert.deepEqual(store.responses.getRapatCalendar.data, []);
  assert.deepEqual(store.responses.getSppdList.data, []);
  assert.equal(store.responses.getMasterData.data.pegawai.length > 0, true);
});

test('uses the Jakarta calendar date for dashboard records', () => {
  const store = createFixtureStore(FIXED_NOW, { seed: buildTestSeed({ today: '2026-11-05', yesterday: '2026-11-04' }) });
  const dashboard = store.responses.getDashboardData.data;

  assert.equal(dashboard.todayMeetings.length, 1);
  assert.equal(dashboard.todayMeetings[0].tanggal, '2026-11-05');
  assert.equal(dashboard.stats.tamuHariIni, 2);
  assert.equal(dashboard.stats.rapatHariIni, 1);
});

test('provides coherent FO and outside visitor statistics', () => {
  const store = createFixtureStore(FIXED_NOW, { seed: buildTestSeed({ today: '2026-11-05', yesterday: '2026-11-04' }) });
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
  const store = createFixtureStore(FIXED_NOW, { seed: buildTestSeed({ today: '2026-11-05', yesterday: '2026-11-04' }) });
  const statuses = store.responses.getSppdList.data.map(item => item.status_sppd);

  assert.deepEqual(statuses, [
    'Belum Lengkap',
    'Menunggu Validasi Teknis',
    'Sah & Terverifikasi'
  ]);
});

test('keeps IDs unique and aligns master room directories without dummy markers', () => {
  const store = createFixtureStore(FIXED_NOW, { seed: buildTestSeed({ today: '2026-11-05', yesterday: '2026-11-04' }) });
  const visitors = store.responses.getTamuList.data;
  const meetings = store.responses.getRapatCalendar.data;
  const masters = store.responses.getMasterData.data;

  assert.doesNotMatch(JSON.stringify([visitors, meetings, masters, store.responses.getSppdList]), /dummy/i);
  visitors.forEach(item => assert.match(item.kode_kunjungan, /^(TLD|TDD)-\d{8}-\d{3}$/));
  assert.equal(new Set(visitors.map(v => v.kode_kunjungan)).size, visitors.length);
  store.responses.getSppdList.data.forEach(item => assert.ok(visitors.some(v => v.kode_kunjungan === item.kode_kunjungan && v.tipe_tamu === 'luar_daerah')));
  assert.deepEqual(masters.ruangan.map(item => item.nama_ruangan), ['Ruang Rapat Utama Diskum', 'Ruangan Bidang Koperasi & UMKM', 'Ruang Rapat Pimpinan / Kadis', 'Ruangan Rapat UPTD PLUT KUMKM']);
});

test('simulates allowed mutations within the isolated local store', () => {
  const store = createFixtureStore(FIXED_NOW);
  const meeting = store.handleMutation('simpanJadwalRapat', completeMeetingPayload({ judul: 'Uji lokal', tanggal: '2026-11-05' }));
  const attendance = store.handleMutation('submitPresensiRapat', { nama: 'Penguji' });

  assert.equal(meeting.success, true);
  assert.match(meeting.message, /simulasi lokal/i);
  assert.match(meeting.data.kode_rapat, /^RPT-/);
  assert.equal(attendance.success, true);
  assert.match(attendance.message, /simulasi lokal/i);
  assert.equal(store.handleMutation('unknownMutation', {}), null);
});

test('uses submission time across Jakarta midnight and resets the shared monthly sequence', () => {
  let time = new Date('2026-11-30T16:59:00Z');
  const store = createFixtureStore(() => time);
  assert.equal(store.handleMutation('registerTamuFo', completeTddPayload()).data.kode_kunjungan, 'TDD-30112026-001');
  time = new Date('2026-11-30T17:01:00Z');
  const fo = store.handleMutation('registerTamuFo', completeTddPayload());
  assert.equal(fo.data.kode_kunjungan, 'TDD-01122026-001');
  assert.equal(store.responses.getTamuList.data[0].jam_kunjungan, '00:01');
  const luar = store.handleMutation('registerTamuLuar', completeTldPayload({ tanggal_kunjungan: '2026-12-02', tujuan_bidang: ['Bidang Pengembangan Usaha Mikro'] }));
  assert.equal(luar.data.kode_kunjungan, 'TLD-02122026-002');
  assert.equal(createFixtureStore(time).responses.getTamuList.data.length, 0, 'new server store starts empty');
});

test('rejects invalid TLD dates without adding a visitor', () => {
  const store = createFixtureStore(FIXED_NOW);
  for (const tanggal_kunjungan of ['', '2026-02-30', 'invalid']) {
    assert.equal(store.handleMutation('registerTamuLuar', completeTldPayload({ tanggal_kunjungan, tujuan_bidang: ['Bidang Pengembangan Usaha Mikro'] })).success, false);
  }
  assert.equal(store.responses.getTamuList.data.length, 0);
});
