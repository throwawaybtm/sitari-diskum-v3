/**
 * TDD intake rules shared by the Tamu-FO form and the generated Public intake bundle.
 * Tracked on purpose: the private, gitignored Destinations.js next to this file holds only the
 * TDD_DESTINATIONS data (PIC names and numbers). build-public.js pastes Destinations.js, then
 * this file, so a private copy that still defines these names is refused before it can break intake.
 */
function getTddPublicDestinations_() {
  return TDD_DESTINATIONS.map(item => ({ bidang: item.bidang, pic: item.pic }));
}

function prepareTddVisit_(payload) {
  const fields = {
    ketua_nama: 'Nama ketua rombongan',
    pengikut_list: 'Daftar anggota rombongan',
    narahubung_hp: 'WhatsApp narahubung',
    keperluan: 'Agenda'
  };
  Object.keys(fields).forEach(field => {
    if (!payload || !String(payload[field] || '').trim()) throw new Error(fields[field] + ' wajib diisi.');
  });
  if (!Number.isInteger(Number(payload.jumlah_orang)) || Number(payload.jumlah_orang) < 1) {
    throw new Error('Total orang harus berupa bilangan bulat minimal 1.');
  }
  const requested = Array.isArray(payload.tujuan_bidang) ? payload.tujuan_bidang : [payload.tujuan_bidang];
  const names = [...new Set(requested)];
  if (!names.length || names.some(name => !TDD_DESTINATIONS.some(item => item.bidang === name))) {
    throw new Error('Pilih minimal satu Bidang Tujuan yang tersedia.');
  }
  const selected = TDD_DESTINATIONS.filter(item => names.indexOf(item.bidang) !== -1);
  return {
    bidang: selected.map(item => item.bidang).join('; '),
    pic: selected.map(item => item.pic).join('; '),
    picIds: selected.map(item => item.id).join('; ')
  };
}
