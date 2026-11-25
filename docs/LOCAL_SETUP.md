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

**Use the synthetic runner as the pass/fail check.** Many tests are written against the fictional data it injects. It copies the tracked sources to a temporary folder, swaps in fictional employees (including the Rapat Pimpinan leaders, through the same `pimpinan_no` / `pimpinan_unit` fields as `Master_Pegawai` columns J/K), PIC/destination lists and approver email (`Admin/EmployeeDirectory.js`, `Admin/VisitPicContacts.js`, both `Destinations.js`, `Admin/PublicIntake.js`, `Admin/DeploymentConfig.js`), and blocks network calls:

```powershell
node local-test/run-synthetic-tests.js
```

Expected: **372/372 passed**.

Running the files directly, `node --test local-test/test/*.test.js`, uses your checkout as it is, without those swaps. With templates alone it passes **356/372**; the other **16** fail because they expect the injected fictional data, not because of a code fault:

| Group | Failing tests | What the test expects | What a templates-only checkout has |
|---|---|---|---|
| Employee directory | `employee-import` (5), `fixtures` (1), `presensi` (1) | A filled directory (the import tests check 70 people in 8 units) | An empty `DISKUM_EMPLOYEE_DIRECTORY` |
| PIC/destination lists and deployment config | `tdd-form` (3), `gas-merge-security` (3), `tld-form` (1), `monthly-tools` (1), `server` (1) | The synthetic PICs, contacts and approver email | Template copies with `PHONE_NUMBER_PLACEHOLDER` / `APPROVER_EMAIL_PLACEHOLDER` |

Restoring the authorized data (Step 4) is expected to fix the employee-directory group; this has not been checked against the real private files. The Rapat Pimpinan and attendance-hierarchy tests (`rapat-pimpinan`, `presensi-validation-hierarchy`, `rapat-internal-rev04`, `master-pegawai-leaders`) bring their own synthetic employees and leaders, so they pass in both runs whatever data the checkout holds. No leader names live in the sources: leaders are read from `Master_Pegawai` (Step 4).

## 4. Import Authorized `Master_Pegawai` CSV

Export the authorized `Master_Pegawai` sheet from Google Sheets as CSV (`File -> Download -> Comma Separated Values (.csv)`) with expected headers (`ID`, `NIP`, `Nama Pegawai`, `Jabatan`, `Bidang`, `Is_LO`, `Workload_Count`, `Status_Aktif`, `Pangkat / Golongan`, and optionally `Urutan_Pimpinan`, `Unit_Pimpinan` for the Rapat Pimpinan leaders), then run:

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
node local-test/run-synthetic-tests.js
node local-test/server.js
```

The synthetic runner is the regression check, with or without the authorized data: expected **372/372** (Step 3). A direct `node --test local-test/test/*.test.js` run is only useful for seeing which tests depend on the injected fictional data; see the table in Step 3.

## 6. Additional Requirements Before Release / GAS Deployment

Local tests use placeholder values and mocks. Before an explicitly approved Google Apps Script deployment or `Public/` rebuild:

1. Restore real PIC WhatsApp numbers in gitignored `Admin/VisitPicContacts.js`, `Tamu-FO/Destinations.js`, `Tamu-Luar/Destinations.js`, and `APPROVER_EMAIL` in `Admin/DeploymentConfig.js` (**never** deploy empty `EmployeeDirectory.js` placeholders to live Sheets).
2. Configure GAS Script Properties in the target project (`APPROVER_EMAIL`, Fonnte token, `ADMIN_DEMO_MODE`, shared spreadsheet/folder IDs, public URLs).
3. Authenticate `clasp` locally (`npx --yes @google/clasp login`) and regenerate `Public/` + `Admin/PublicIntake.js` via `node maintenance/build-public.js <AdminCoreVersion>` once approved.
