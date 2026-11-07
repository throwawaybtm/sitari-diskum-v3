# TDD form revision — proposal for review

Status: superseded by the user's simplified scope in `2026-10-26-tdd-simplified-design.md`. The proposals below are retained for history, not implementation instructions.

## Intent

Bring the QR-accessed Tamu Dalam Daerah / FO form into line with the latest TLD form while preserving its purpose: record an arriving visitor and their intended recipients in the shared database.

## Proposed presentation

- Header/page title: “Pendaftaran Kunjungan Tamu Dalam Daerah”.
- Header chip: “TAMU DALAM DAERAH”; retain the tablet icon.
- Description: “Silakan lengkapi data kunjungan”.
- White card heading: “Data Kunjungan”, followed by a red “* Wajib diisi” note.
- Match the current TLD background, font, compact content-fitting form width, equal-width destination cards, centered checkboxes, and responsive single-column layout on phones.
- Submit label: “Kirim Pendaftaran Kunjungan”, with gradient `#11504a → #143238` and consistent submitting/error/reset states. Remove queue-number promises because the current backend does not generate a queue number.
- Success modal: visit code, selected Bidang, and all Penerima Tamu names; handle long/multiple values and short phone screens.

## Proposed fields, in order

1. Nama Instansi / Asal Pengunjung — required; accept “Perorangan” for an unaffiliated visitor.
2. Alamat Instansi / Domisili — required.
3. Bidang Tujuan — the same nine destinations and fixed PICs supplied for TLD; show the PIC name inside each card; select one or more; no preselected destination.
4. Agenda — required.
5. Nama Pengunjung / Ketua Rombongan — required.
6. Jumlah Orang — required positive integer, default 1.
7. Daftar Anggota Rombongan — required; a solo visitor enters their own name, matching the latest TLD rule.
8. Tanggal dan Jam Kedatangan — display current Batam/Jakarta time automatically, read-only; update the display while the form is open. Backend submission time is authoritative for arrival date/time and visit code.
9. WhatsApp Narahubung — required, full-width, matching TLD alignment.
10. Existing SPPD declaration — optional yes/no checkbox, initially unchecked; do not force a visitor to claim they carry SPPD.

All editable data fields carry red asterisks and validation in browser and backend. Automatic arrival fields carry an “Otomatis” note instead of implying the visitor must enter them.

## Recipient directory and storage

Use the same nine destination/PIC mappings as TLD, replacing FO's current round-robin assignment for new TDD submissions. Visitors choose destination cards; recipients derive from the authoritative server directory, not from client-supplied names.

Each Apps Script project must remain independently pushable with clasp. Proposed approach: a corresponding server-only directory in `Tamu-FO/Destinations.js`, checked against TLD by a parity test. This avoids introducing a deployment build or cross-project calls for a small form revision. A shared generated directory is a future alternative if mappings change frequently.

Keep PIC numbers on the server for future WA integration. Public HTML and registration responses include destination/PIC names only. Retain existing Data_Tamu columns; save multiple destinations and PICs as semicolon-separated values so the Admin's existing multi-badge and multi-receiver rendering continues to work. Preserve TDD code prefix and shared monthly TLD/TDD serial logic. Existing records are unchanged.

## Document-upload choice requiring review

Recommendation: keep TDD without document uploads for the short FO/QR intake workflow. TLD's two required letters need not be copied to an arriving local visitor form.

Alternative: add the same two required document uploads as TLD, each with “Pilih File” and phone-only “Ambil Gambar”, PDF/photo support, and 5 MB per-file limit. This also requires FO Drive storage helpers, folder permissions/configuration, and a larger local request-body limit for registerTamuFo. These are not present in the current TDD backend.

The implementation plan assumes the recommended no-upload variant until the user chooses otherwise. No app changes will begin before review.

## Delivery boundaries

Archive current TDD and local harness before implementation. Test locally, including Admin reflection, then restart the verified local server and refresh the preview if available. Do not push to GAS, deploy, send WA messages, or migrate old data during this revision.
