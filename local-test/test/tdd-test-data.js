'use strict';
function completeTddPayload(overrides = {}) {
  return {
    ketua_nama: '[DUMMY] Pengunjung TDD', jumlah_orang: 1,
    pengikut_list: '[DUMMY] Pengunjung TDD',
    narahubung_hp: '080000000000', tujuan_bidang: ['Bidang Pengawasan Koperasi'],
    keperluan: '[DUMMY] Agenda TDD', ...overrides
  };
}
module.exports = { completeTddPayload };
