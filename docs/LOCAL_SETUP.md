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

**Use the synthetic runner as the pass/fail check.** Most tests are written against the fictional data it injects. It copies the tracked sources to a temporary folder, swaps in fictional employees, PIC/destination lists, approver email and leadership rows (`Admin/EmployeeDirectory.js`, `Admin/VisitPicContacts.js`, both `Destinations.js`, `Admin/PublicIntake.js`, `Admin/DeploymentConfig.js`, `RAPAT_PIMPINAN_DIRECTORY` in `Admin/RapatPimpinan.html` and `OFFICIAL_LEADERSHIP_ORDER_` in `Admin/AgendaAttendanceData.js`), and blocks network calls:

```powershell
node local-test/run-synthetic-tests.js
```

Expected: **366/366 passed** (checked on branch `rev/intake-logic-tracked`, 2026-11-25).

Running the files directly, `node --test local-test/test/*.test.js`, uses your checkout as it is, without those swaps. With templates alone it passes **342/366**; the other **24** fail because they expect the injected fictional data, not because of a code fault:

| Group | Failing tests | What the test expects | What a templates-only checkout has |
|---|---|---|---|
| Employee directory | `employee-import` (5), `fixtures` (1), `presensi` (1) | A filled directory (the import tests check 70 people in 8 units) | An empty `DISKUM_EMPLOYEE_DIRECTORY` |
| PIC/destination lists and deployment config | `tdd-form` (3), `gas-merge-security` (3), `tld-form` (1), `monthly-tools` (1), `server` (1) | The synthetic PICs, contacts and approver email | Template copies with `PHONE_NUMBER_PLACEHOLDER` / `APPROVER_EMAIL_PLACEHOLDER` |
| Leadership rows | `rapat-pimpinan` (4) | The 13 synthetic leaders from `local-test/test/synthetic-fixtures.js` | The tracked real `RAPAT_PIMPINAN_DIRECTORY` |
| Hierarchy order | `presensi-validation-hierarchy` (2), `rapat-internal-rev04` (2) | Synthetic leaders and employees in a known order | The real or empty lists above |

Restoring the authorized data (Step 4) is expected to fix the employee-directory group. The leadership and hierarchy tests compare against the synthetic names (none of which match the tracked real leaders), so they are expected to keep failing under a direct `node --test` run even with real data. This has not been checked against the real private files.

### Trim the private destinations files (one time)

The intake logic (upload limits, validation and visit preparation) used to live inside the private `Tamu-Luar/Destinations.js` and `Tamu-FO/Destinations.js`. It is now tracked in `Tamu-Luar/IntakeRules.js` and `Tamu-FO/IntakeRules.js`. The private files hold only their data array: `const TLD_DESTINATIONS = [ ... ];` or `const TDD_DESTINATIONS = [ ... ];`.

An older private copy still defines that logic, so `node maintenance/build-public.js` refuses to build and `node local-test/setup-local.js --check` exits 1. Both name each extra symbol and never print the file contents. To migrate a PC that has the real private files:

1. In each of the two private files, keep the `const ..._DESTINATIONS = [ ... ];` array with its real rows, and delete everything else: the `TLD_MAX_UPLOAD_BYTES` / `TLD_MAX_UPLOAD_FILES` constants and every function. `config-templates/*/Destinations.js.example` shows the expected shape.
2. Run `node local-test/setup-local.js --check`. It should list no "not data-only" problems.
3. Build and test only as part of an approved release: `node maintenance/build-public.js <AdminCoreVersion>`, then `node local-test/run-synthetic-tests.js`.

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
node local-test/run-synthetic-tests.js
node local-test/server.js
```

The synthetic runner is the regression check, with or without the authorized data: expected **366/366** (Step 3). A direct `node --test local-test/test/*.test.js` run is only useful for seeing which tests depend on the injected fictional data; see the table in Step 3.

## 6. Additional Requirements Before Release / GAS Deployment

Local tests use placeholder values and mocks. Before an explicitly approved Google Apps Script deployment or `Public/` rebuild:

1. Restore real PIC WhatsApp numbers in gitignored `Admin/VisitPicContacts.js`, `Tamu-FO/Destinations.js`, `Tamu-Luar/Destinations.js`, and `APPROVER_EMAIL` in `Admin/DeploymentConfig.js` (**never** deploy empty `EmployeeDirectory.js` placeholders to live Sheets).
2. Configure GAS Script Properties in the target project (`APPROVER_EMAIL`, Fonnte token, `ADMIN_DEMO_MODE`, shared spreadsheet/folder IDs, public URLs).
3. Authenticate `clasp` locally (`npx --yes @google/clasp login`) and regenerate `Public/` + `Admin/PublicIntake.js` via `node maintenance/build-public.js <AdminCoreVersion>` once approved. The build refuses private `Destinations.js` files that still hold intake logic; see "Trim the private destinations files" in Step 3.
