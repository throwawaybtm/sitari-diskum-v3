# Data model (Google Sheets)

Headers come from `Admin/Setup.js` (`setupSheet*_`). Index = 0-based array index used in code (`r[n]`). Confirm against `Admin/Setup.js` and migration code before relying on a position.

## Data_Tamu (visits; TDD and TLD rows)
| # | Column | # | Column | # | Column |
|---|---|---|---|---|---|
| 0 | ID | 7 | Pengikut_List | 14 | URL_Surat_Kunjungan |
| 1 | Kode_Kunjungan | 8 | Tujuan_Bidang | 15 | URL_Surat_Tugas |
| 2 | Tipe_Tamu | 9 | Keperluan | 16 | LO_ID |
| 3 | Instansi | 10 | Narahubung_Nama | 17 | LO_Nama |
| 4 | Alamat | 11 | Narahubung_HP | 18 | Bawa_SPPD |
| 5 | Jumlah_Orang | 12 | Tanggal_Kunjungan | 19 | Status_Kunjungan |
| 6 | Ketua_Nama | 13 | Jam_Kunjungan | 20 | Timestamp |

- Row mapping for the client: `mapVisitRow_` (`Admin/Code.js` ~693) and dashboard read (~467): `jam_kunjungan: formatTimeVal(r[13])`, `surat_tugas_file: r[15]`.
- No check-in column. Timestamp is the record write time.
- TLD letters: one URL per slot (O = Surat Kunjungan, P = Surat Tugas).

## Data_Rapat (meetings)
ID, Kode_Rapat, Judul_Rapat, Ruangan_ID, Nama_Ruangan, Tanggal, Jam_Mulai, Jam_Selesai, Bidang_Penyelenggara, Pimpinan_Rapat, Jumlah_Peserta, Agenda, Status, Timestamp.

## Data_Presensi (attendance)
ID, Rapat_ID, Judul_Rapat, Kategori_Peserta, Nama_Peserta, NIP, Jabatan, Nama_OPD_Bidang, No_HP, Waktu_Hadir, Anggota Kunjungan ID, Sumber Presensi, Waktu Pencatatan.

## Kendali_SPPD (SPPD evidence and sign-off)
SPPD_ID, Tamu_ID, Kode_Kunjungan, Instansi, Ketua_Nama, URL_Foto, URL_Absen, URL_Notulen, Status_SPPD, TTD_Teknis_Status, TTD_Teknis_Nama, TTD_Teknis_Waktu, TTD_Kasubag_Status, TTD_Kasubag_Nama, TTD_Kasubag_Waktu, Catatan, Timestamp.

## Master sheets
- Master_Pegawai: ID, NIP, Nama Pegawai, Jabatan, Bidang, Is_LO, Workload_Count, Status_Aktif (employee lookup and hierarchy; LO = liaison officer).
- Master_OPD: ID, Nama OPD Pemko Batam, Kategori.
- Master_Ruangan: ID, Nama Ruangan, Kapasitas, Fasilitas, Lokasi, Warna_Hex.

## Sidecar sheets (created on demand)
- Alur_Kunjungan: Kode Kunjungan, Versi, Data Alur JSON, Diperbarui (visit workflow state; `Admin/VisitWorkflowStorage.js`).
- Dokumen_Agenda, Foto_Agenda, Riwayat_Agenda: agenda documents/notula, photos, schedule history (`Admin/AgendaDocuments.js`).

Real data never enters Git or tests; use fixtures in `local-test/` (`synthetic-fixtures.js`, `tdd-test-data.js`, `tld-test-data.js`, `meeting-test-data.js`).
