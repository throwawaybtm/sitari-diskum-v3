# Si Tari Local Preview Harness

This harness displays the current Admin app with fictional local preview records and natural-looking names and identifiers. It runs only on your computer and does not connect to Google Apps Script, Google Sheets, Google Drive, WhatsApp, or Fonnte.

## Start

Preview preference (1 November 2026): use **VS Code's integrated browser** for local and deployed app reviews. Open `http://127.0.0.1:4173/mobile-preview` there to inspect Admin, TLD, TDD and Presensi at different widths. This preview tests responsive layout; it does not emulate a phone camera, Safari, or a coarse touch pointer. Verify those separately on a physical phone when needed.

From the repository root (after following `docs/LOCAL_SETUP.md`), run:

```powershell
node local-test/server.js
```

Open:

```text
http://127.0.0.1:4173/
```

Use a different port if necessary:

```powershell
$env:PORT=4180
node local-test/server.js
```

Stop the server with `Ctrl+C`.

## What is simulated

- Dashboard statistics and recent visits
- FO and outside-visitor records
- Current and upcoming meetings
- Meeting room settings: Utama Diskum 50, Konsultasi 5, Pimpinan 10; matching room badges and completed-meeting actions.
- Incomplete, pending, and verified SPPD records
- Employee, OPD, and room dropdown data
- Meeting scheduling, room conflict checks, and agenda-linked attendance retained in memory
- TDD/FO form: http://127.0.0.1:4173/tamu-fo
- TLD form: http://127.0.0.1:4173/tamu-luar
- Guest submissions appear in the open Admin view within about two seconds, or when returning to its tab.

Guest submissions are held in memory and reset when the server stops. TDD and TLD use their server-side destination/PIC directories in `Tamu-FO/Destinations.js` and `Tamu-Luar/Destinations.js`, with PIC phone numbers excluded from public responses. Multiple selections appear as individual badges and receiver names in Admin. New TDD records retain only headcount (no member-name field), automatically record arrival time, and are Non-SPPD; the form has no date/time inputs, uploads, or SPPD checkbox. The seed set contains five visits (three TLD and two TDD), two internal meetings, staff/OPD choices, and generated sample PDF attachments. Record labels, identifiers, and descriptions contain no dummy markers, as requested.

TLD accepts PDF or photos (JPG, PNG, WebP, HEIC/HEIF), up to 5 MiB per file. Attachments are validated and held in memory, accessible through `/local-doc/<id>` until restart. Registration and workflow uploads accept a 15 MiB request body for base64 files; other endpoints retain the 1 MiB limit. Nothing is uploaded to Drive during local testing.

## Visit workflow testing

All new TLD requests start at **Menunggu Konfirmasi**, with no membawa SPPD checkbox. TDD remains Non-SPPD with a disabled action. Open **EDIT** on a TLD row:

1. **KONFIRMASI:** review details and acknowledge; the status stays Menunggu Konfirmasi.
2. **DISPOSISI:** upload a scan and press SUDAH DISPOSISI.
3. **NOTIFIKASI:** simulate notifications to all selected PICs, then reserve a room/date/start/end. The agenda appears in Jadwal Rapat, sharing its room-conflict checks.
4. **KEDATANGAN:** guests use that agenda's QR to select their registered ketua/member name. Admin can also use Presensi Manual beside the TLD agenda to mark registered attendees. Both methods deduplicate check-ins and feed the same roster results in Kedatangan. Enter one member per line in the TLD request so commas in academic degrees stay intact. Reload attendance results here, then validate after the visit's scheduled end. Validated attendance is frozen.
5. **SPPD:** upload Foto Kegiatan and Daftar Hadir. E-Notulen is not required. VALIDASI keeps the SPPD tab open and enables the final tab. Print or download the pengesahan from SPPD, then choose Lanjut ke SELESAI. Downloads generate a real A4 PDF in the browser, with wrapped details and physical-signature spaces.
6. **SELESAI:** save the physically signed pengesahan, then press SELESAI. The modal closes and the row action becomes read-only VIEW.

The surat pengesahan uses an initial layout based on the existing print document, with blank physical-signature spaces. Review official wording and signatory details before release.

Every stage, reservation, attendance entry and document resets on server restart. Seed rows include pending, SPPD-review, and completed TLD cases; a fresh registration exercises the entire flow.

The GAS adapter stores milestones in a new `Alur_Kunjungan` sidecar sheet and requires the assigned admin's `APPROVER_EMAIL` Script Property. Production WhatsApp sending remains disabled until Fonnte is configured for release; the GAS endpoint returns an explicit error and does not advance the workflow. No live deployment or external message is part of local testing.

## Safety boundaries

- Fictional preview records live only under `local-test/`.
- The `Admin/`, `Tamu-FO/`, and `Tamu-Luar/` directories contain no dummy fixtures.
- Run clasp only from one of those three app directories. The top-level `local-test/` directory is outside every clasp project and cannot be uploaded by their current configurations.
- Both standalone forms use the local registration endpoints. No registration data is sent to the live projects.

## Tests

```powershell
node --check local-test/fixtures.js
node --check local-test/server.js
node --test local-test/test/*.test.js
```

Uploaded documents in the visit modal use square preview cards: two columns on desktop and one on phones. New file selections preview before saving; saved images and PDFs preview in place, and Drive links use the Drive preview viewer. Unsupported browser image formats retain a file-open link.

PDF export uses pinned jsPDF 4.2.1 from jsDelivr with an integrity hash. Its MIT-licensed UMD distribution is cached under `local-test/vendor/` only for real PDF-output tests; this cache is outside all clasp projects.

Dashboard Kunjungan Tamu Terbaru shares the Buku Tamu row presentation (ID/date/time, institution/address, visitor/contact, bidang/agenda, receiver, workflow status). Detail switches to Buku Tamu and opens the matching workflow modal. Non-SPPD entries open read-only visitor details; completed TLD entries retain their read-only workflow view.
