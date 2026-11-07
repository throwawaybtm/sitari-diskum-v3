'use strict';

const testDocument = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 local test').toString('base64');
function completeTldPayload(overrides = {}) {
  return {
    instansi: '[DUMMY] Instansi Uji', alamat: '[DUMMY] Alamat Uji', ketua_nama: '[DUMMY] Penguji',
    jumlah_orang: 1, pengikut_list: '[DUMMY] Penguji', keperluan: '[DUMMY] Agenda Uji',
    narahubung_hp: '080000000000', tanggal_kunjungan: '2026-10-26', jam_kunjungan: '09:00',
    tujuan_bidang: ['UPTD PLUT KUMKM'], surat_kunjungan_base64: testDocument,
    surat_tugas_base64: testDocument, bawa_sppd: 0, ...overrides
  };
}
module.exports = { completeTldPayload, testDocument };
