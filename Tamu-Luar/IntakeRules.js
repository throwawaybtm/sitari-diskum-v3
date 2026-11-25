/**
 * TLD intake rules shared by the Tamu-Luar form and the generated Public intake bundle.
 * Tracked on purpose: the private, gitignored Destinations.js next to this file holds only the
 * TLD_DESTINATIONS data (PIC names and numbers). build-public.js pastes Destinations.js, then
 * this file, so a private copy that still defines these names is refused before it can break intake.
 */
const TLD_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function getTldPublicDestinations_() {
  return TLD_DESTINATIONS.map(item => ({ bidang: item.bidang, pic: item.pic }));
}

function validateTldUpload_(value) {
  if (!value) return;
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value));
  if (!match || match[2].length % 4 !== 0) {
    throw new Error('Dokumen harus berupa PDF atau foto (JPG, PNG, WebP, HEIC).');
  }
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  if ((match[2].length / 4) * 3 - padding > TLD_MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran setiap dokumen maksimal 5 MB.');
  }
}

const TLD_MAX_UPLOAD_FILES = 5;

/** A TLD upload field accepts one data URL (legacy clients) or an array of up to TLD_MAX_UPLOAD_FILES. */
function normalizeTldUploads_(value, required) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  if (required && !list.length) throw new Error('Pilih minimal satu dokumen pada setiap kolom unggahan.');
  if (list.length > TLD_MAX_UPLOAD_FILES) throw new Error('Maksimal ' + TLD_MAX_UPLOAD_FILES + ' dokumen pada setiap kolom unggahan.');
  if (list.some(item => typeof item !== 'string' || !item.trim())) throw new Error('Dokumen unggahan tidak valid.');
  return list;
}

function validateTldRequiredFields_(payload) {
  const fields = {
    instansi: 'Nama instansi', alamat: 'Alamat instansi', ketua_nama: 'Nama ketua rombongan',
    pengikut_list: 'Daftar anggota rombongan', keperluan: 'Agenda',
    narahubung_hp: 'WhatsApp narahubung', tanggal_kunjungan: 'Tanggal kunjungan',
    jam_kunjungan: 'Jam kunjungan', surat_kunjungan_base64: 'Surat permohonan kunjungan',
    surat_tugas_base64: 'Surat tugas rombongan'
  };
  Object.keys(fields).forEach(field => {
    if (!payload || !String(payload[field] || '').trim()) throw new Error(fields[field] + ' wajib diisi.');
  });
  const count = Number(payload.jumlah_orang);
  if (!Number.isInteger(count) || count < 1) throw new Error('Jumlah orang wajib diisi dengan bilangan bulat minimal 1.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.jam_kunjungan)) throw new Error('Jam kunjungan tidak valid.');
}

function prepareTldVisit_(payload) {
  normalizeTldUploads_(payload && payload.surat_kunjungan_base64, false).forEach(data => validateTldUpload_(data));
  normalizeTldUploads_(payload && payload.surat_tugas_base64, false).forEach(data => validateTldUpload_(data));
  // Assignment is performed by the admin after reviewing the request.
  return {bidang:'',pic:'',picIds:''};
}
