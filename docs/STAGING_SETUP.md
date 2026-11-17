# Staging environment (SITARI STAGING)

A full, separate copy of SITARI on Google: its own Admin and Public Apps Script projects, its own
copy of the database and its own Drive folders. Use it to test a revision end to end (forms,
uploads, workflow, PDFs, presensi) before an owner release. Nothing in staging writes to production.

| Part | Production | Staging |
|---|---|---|
| Database | `DB_SI_TAMU_DISKUM_BATAM` | `STAGING_DB_SI_TARI <date>` (a copy) |
| Drive | `SI-TAMU DISKUM KOTA BATAM` | `SI-TARI STAGING (bukan produksi)` with `1. Surat Tamu STAGING`, `2. Bukti Kegiatan SPPD STAGING` |
| Apps Script | Admin + Public (live URLs) | `SI-TARI STAGING - Admin`, `SI-TARI STAGING - Public` |
| WhatsApp (Fonnte) | as configured | off, token removed (optional test mode: sends only to 2 test numbers) |
| Look | normal | orange "STAGING - data uji, bukan produksi" bar on every page |

All staging IDs and URLs live in the gitignored `.staging/config.json` on the owner PC. Never commit them.

## How staging stays isolated

- `maintenance/staging/build-staging.js` copies `Admin/` into `.staging/admin/`, builds Public into
  `.staging/public/` against the **staging** Admin library, and never writes `Admin/`, `Public/` or a production `.clasp.json`.
- It adds `StagingConfig.js`, which runs before every request and pins `SPREADSHEET_ID`, `FOLDER_SURAT_ID`,
  `FOLDER_BUKTI_ID`, `APPROVER_EMAIL`, the staging form URLs, `FONNTE_DISABLED=true`, `PUBLIC_DEV_MODE=false`,
  `ADMIN_DEMO_MODE=false`, and deletes any `FONNTE_TOKEN`. This matters because `getSpreadsheet()` falls back to
  finding `DB_SI_TAMU_DISKUM_BATAM` **by name** when `SPREADSHEET_ID` is missing, which would hit production.
- The build refuses to run if any staging ID equals a production script/spreadsheet ID, and fails if a production
  script ID appears in the build output.
- Existing rows copied from production still link to the production Drive files. Staging only reads those links;
  the code has no Drive delete/trash calls, and new uploads go to the staging folders.

## 1. Copy the database and create folders (done 2026-11-17)

1. Create Drive folder `SI-TARI STAGING (bukan produksi)` with the two subfolders above.
2. Copy `DB_SI_TAMU_DISKUM_BATAM` into it as `STAGING_DB_SI_TARI <date>` (Drive: right click -> Make a copy).
   Do **not** keep the name `DB_SI_TAMU_DISKUM_BATAM`.
3. Write `.staging/config.json`:

```json
{
  "spreadsheetId": "<staging spreadsheet id>",
  "folderSuratId": "<1. Surat Tamu STAGING folder id>",
  "folderBuktiId": "<2. Bukti Kegiatan SPPD STAGING folder id>",
  "approverEmail": "<owner google account>"
}
```

To refresh staging data later, make a new copy of the production sheet and update `spreadsheetId`.

## 2. Build (agents may run this)

```powershell
node maintenance/staging/build-staging.js
```

Output goes to `.staging/admin` and `.staging/public`. No network, no clasp.

The build needs the gitignored private files (for example `Tamu-Luar/Destinations.js`). On a fresh checkout,
copy the real ones in, or run `node local-test/setup-local.js --from-templates` for placeholder data.

## 3. Create and deploy (owner only, once per release candidate)

Requires `clasp` logged in to the owner account. Run it yourself in a terminal (the SITARI guard blocks agents
from clasp create/push/deploy):

```powershell
node maintenance/staging/deploy-staging.js
```

First run creates the two staging projects; every run then: pushes Admin -> creates an Admin library version ->
builds Public pinned to it -> pushes and deploys Public -> rebuilds Admin with the staging form URLs -> pushes and
deploys Admin. Deployment IDs are reused, so staging URLs stay the same. It prints the Admin, TLD and TDD URLs.

First time only: open the Admin URL and the TLD URL while signed in to the owner account and allow the permissions
prompt (Public runs as the owner, so anonymous guests cannot grant it).

## 4. Test

- Admin: dashboard, Buku Tamu, Jadwal Rapat, Lainnya; the orange STAGING bar must be visible.
- TDD and TLD forms: submit test visits with uploads; check they appear in Admin and the files land in the
  staging Drive folders (not `SI-TAMU DISKUM KOTA BATAM`).
- TLD workflow: KONFIRMASI -> DISPOSISI -> NOTIFIKASI (WhatsApp shows as disabled, or sends to the test numbers in
  test mode) -> KEDATANGAN (QR / manual presensi) -> SPPD -> SELESAI, plus PDFs.
- Mark test data clearly (for example names ending in "Uji").

## 4a. WhatsApp test mode (optional, owner only)

Staging keeps WhatsApp off. To test the WhatsApp notifications for real, turn on test mode. Every message is then sent
only to two test numbers, whatever numbers the visit or the PIC directory hold:

- `contactPhone` receives every Narahubung (visitor contact) message.
- `picPhone` receives every Penerima Tamu (PIC) message.
- Each message starts with `[UJI STAGING - bukan produksi]`.
- Any other number is refused inside the script, and the build stops if a WhatsApp send path in Admin is not
  redirected (for example after the Admin code changes).

1. Add this to the gitignored `.staging/config.json` (never commit real numbers):

```json
"whatsappTest": { "enabled": true, "contactPhone": "08xxxxxxxxxx", "picPhone": "08xxxxxxxxxx" }
```

2. Build and deploy staging as usual (sections 2 and 3). The build output says `whatsapp: 'TEST mode ...'`.
3. In the **STAGING Admin** Apps Script project (not production), add Script Property `FONNTE_TOKEN` with the Fonnte
   token of the device you test with. With test mode off, staging deletes this property again on the next request.
4. Test: submit a TLD visit, assign a Penerima Tamu, then press Kirim Notifikasi (PIC) and the Narahubung notification.
   Both test phones should receive one message each.
5. Turn it off afterwards: set `"enabled": false` (or remove the block), rebuild and redeploy. Staging deletes the
   token and disables WhatsApp again.

## 5. Remove staging

Trash the two `SI-TARI STAGING` Apps Script projects and the `SI-TARI STAGING (bukan produksi)` folder, then delete
`.staging/`. Production is unaffected.
