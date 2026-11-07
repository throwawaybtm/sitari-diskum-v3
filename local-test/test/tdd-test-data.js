'use strict';
function completeTddPayload(overrides = {}) {
  return {
    ketua_nama: '[DUMMY] Pengunjung TDD', jumlah_orang: 1,
    narahubung_hp: '080000000000', tujuan_bidang: ['Bidang Pengawasan Koperasi'],
    keperluan: '[DUMMY] Agenda TDD', ...overrides
  };
}
module.exports = { completeTddPayload };
