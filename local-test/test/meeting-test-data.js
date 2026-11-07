'use strict';
function completeMeetingPayload(overrides = {}) {
  return {
    judul: '[DUMMY] Rapat Pengujian', ruangan: '6001|Ruang Rapat Utama Diskum',
    tanggal: '2026-10-26', jam_mulai: '09:00', jam_selesai: '10:00',
    bidang: 'Sekretariat / Umpeg', pimpinan: '[DUMMY] Pimpinan', agenda: '[DUMMY] Agenda pengujian',
    ...overrides
  };
}
module.exports = { completeMeetingPayload };
