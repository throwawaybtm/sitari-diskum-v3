# Local Setup & Portability Guide

Follow these steps to set up **SI-TARI DISKUM v3** on a fresh GitHub clone for local preview and test verification without exposing private records or credentials.

## 1. Prerequisites

- **Git** and **Node.js** (tested on Node `v24+` with built-in `node:test`, `node:http`, `node:vm`, and `node:fs`).
- **No `npm install` required:** Local preview and tests use Node built-ins plus tracked browser PDF libraries cached under `local-test/vendor/`.
- **Optional (deployment only):** `@google/clasp` and private Google OAuth credentials (`.clasprc.json`), stored strictly outside Git.

## 2. Clone the Active Branch

```powershell
git clone -b client/revisions-2026-11-10 https://github.com/throwawaybtm/sitari-diskum-v3.git
cd sitari-diskum-v3
```

## 3. Initialize Gitignored Local Config & Test Templates

Git ignores **10** local configuration, employee directory, and private test files. Bootstrap safe placeholder copies from `config-templates/` without overwriting any already-restored private files:

```powershell
node local-test/setup-local.js --from-templates
```

This creates local gitignored copies (if absent) for:

- `Admin/DeploymentConfig.js`
- `Admin/EmployeeDirectory.js`
- `Admin/PublicIntake.js`
- `Admin/VisitPicContacts.js`
- `Tamu-FO/Destinations.js`
- `Tamu-Luar/Destinations.js`
- `local-test/previews/employee-directory.json`
- `local-test/test/public-project.test.js`
- `local-test/test/tdd-form.test.js`
- `local-test/test/tld-form.test.js`

With templates alone, `232/238` tests run immediately. The remaining **6** tests (`employee-import.test.js` and hierarchy checks in `rapat-internal-rev04.test.js`) require the authorized employee directory in Step 4.

## 4. Import Authorized `Master_Pegawai` CSV

Export the authorized `Master_Pegawai` sheet from Google Sheets as CSV (`File -> Download -> Comma Separated Values (.csv)`) with expected headers (`ID`, `NIP`, `Nama Pegawai`, `Jabatan`, `Bidang`, `Is_LO`, `Workload_Count`, `Status_Aktif`, `Pangkat / Golongan`), then run:

```powershell
node local-test/setup-local.js --csv path/to/Master_Pegawai.csv
```

This populates both gitignored employee targets:

- `Admin/EmployeeDirectory.js` (`DISKUM_EMPLOYEE_DIRECTORY`)
- `local-test/previews/employee-directory.json`

Verify setup readiness without printing private contents:

```powershell
node local-test/setup-local.js --check
```

Keep the source CSV outside the repository (or remove any temporary copy) so it is never committed.

## 5. Run Full Regression & Local Preview

```powershell
node --test local-test/test/*.test.js
node local-test/server.js
```

Expected full local regression result: **238/238 passed**.

## 6. Additional Requirements Before Release / GAS Deployment

Local tests use placeholder values and mocks. Before an explicitly approved Google Apps Script deployment or `Public/` rebuild:

1. Restore real PIC WhatsApp numbers in gitignored `Admin/VisitPicContacts.js`, `Tamu-FO/Destinations.js`, `Tamu-Luar/Destinations.js`, and `APPROVER_EMAIL` in `Admin/DeploymentConfig.js` (**never** deploy empty `EmployeeDirectory.js` placeholders to live Sheets).
2. Configure GAS Script Properties in the target project (`APPROVER_EMAIL`, Fonnte token, `ADMIN_DEMO_MODE`, shared spreadsheet/folder IDs, public URLs).
3. Authenticate `clasp` locally (`npx --yes @google/clasp login`) and regenerate `Public/` + `Admin/PublicIntake.js` via `node maintenance/build-public.js <AdminCoreVersion>` once approved.
