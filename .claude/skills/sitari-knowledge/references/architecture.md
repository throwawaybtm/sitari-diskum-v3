# Architecture (verified at 0de798d, 2026-11-16)

## Surfaces
| Surface | Source | Role |
|---|---|---|
| Admin web app | `Admin/` | Privileged dashboard. Also published as the immutable library **SiTariCore** that Public calls. `doGet` (`Admin/Code.js:9`) calls `requireVisitAdmin_()` first, then routes `?page=presensi`/`presensi-admin` to `Presensi.html`, else `Index.html`. |
| Public web app | `Public/` (generated) | Anonymous testing surface: TDD form (`Tdd.html`), TLD form (`Tld.html`), Presensi. `Public/Code.js` is thin wrappers: `registerTamuLuar`, `registerTamuFo`, `getMasterData`, `getRapatCalendar`, `getVisitAttendanceRoster`, `submitPresensiRapat` -> `SiTariCore.*`. |
| Tamu-FO / Tamu-Luar | `Tamu-FO/`, `Tamu-Luar/` | Authoring + local-test sources for the TDD (front office) and TLD (external) intake forms. Not in the active deployment sequence. |
| Legacy | `maintenance/build-legacy-tdd.js` | Old standalone TDD serves a migration notice, no writes. |

Flow: `Public/Code.js` -> SiTariCore (Admin library, pinned version) -> Admin API / bundled intake (`Admin/PublicIntake.js`, private, generated) -> shared Sheets + Drive. Public has no database of its own.

## Build and deploy (owner-only steps)
- `node maintenance/build-public.js <AdminCoreVersion>` regenerates `Public/` and `Admin/PublicIntake.js`. It bundles both data-only `Destinations.js` files, both tracked `IntakeRules.js` files, `Tamu-Luar/Code.js` (minus `doGet`) and `registerTamuFo` into `SI_TARI_INTAKE_` (it refuses a `Destinations.js` that defines anything besides its array), writes `Public/appsscript.json` pinning SiTariCore to that version, and copies `Tamu-Luar/Index.html` to `Tld.html`, `Tamu-FO/Index.html` to `Tdd.html`.
- So a change to an intake form or intake server code only reaches Public after an approved Admin library version + Public rebuild. Admin-side changes reach Admin only after an approved clasp push/deploy.
- Release order (handover book): clean tested SHA -> push Admin + create immutable library version -> build Public with that version -> review generated diff -> update existing deployments (keep URLs; Public before switching Admin) -> smoke checklist. Rollback = restore the previous Admin/Public version pair + core pin together. Script Properties, uploads, sheet writes and sent messages are not rolled back by redeploys.
- Owner-reported live versions: Admin @49, Public @19, core pin 49. `README.md` and `deployments/2026-11-01/projects.json` (45/15/37) are historical.

## Authorization
- `requireVisitAdmin_()` (`Admin/VisitWorkflowStorage.js:37`): passes if public-dev mode is enabled for the personal dev environment, or `ADMIN_DEMO_MODE === 'true'`, or the active user's email is in Script Property `APPROVER_EMAIL`; otherwise throws (fails closed). Called at ~40 Admin entry points.
- Both checked-in web-app manifests use USER_DEPLOYING + ANYONE_ANONYMOUS; the owner console is the source of truth for deployed access.
- Public responses must omit PIC phone numbers and private workflow file links. Deny unauthorized admin calls server-side; validate agenda, roster and inputs at the server boundary.

## Concurrency and IDs
- Numeric row IDs (`ID`) are distinct from visit codes (`Kode_Kunjungan`).
- `nextRecordId_` = max numeric ID + 1. It exists in three copies that must stay identical: `Admin/Code.js:225`, `Tamu-FO/Code.js:133`, `Tamu-Luar/Code.js:167` (checked by `safe-id-generation.test.js`).
- Writers take `LockService.getScriptLock()` (waitLock 30000) and hold it through writes and `SpreadsheetApp.flush()`, releasing in `finally`. Public wrappers share the Admin backend's lock context.

## Integrations
- Drive: TLD letters go to folder "1. Surat Tamu (Kunjungan & Tugas)" under "SI-TAMU DISKUM KOTA BATAM", shared ANYONE_WITH_LINK VIEW (`Tamu-Luar/Code.js:48-77`).
- Fonnte (WhatsApp): `Admin/VisitNotifications.js`; `isFonnteDisabled_` gate; ADR 0001 = dedicated org-owned number, bounded retries, manual follow-up. Never send live during development; tests mock it.

## Invariants to preserve
Column order, date types, visit-code formats, agenda links, legacy row fallbacks; read historical rows without rewriting; partial failure and retry are first-class; server-enforced locks on every write path (Ditunda / Terkunci); client-approved UI and `Admin/Stylesheet.html`; Bahasa Indonesia labels; A4 PDF layouts; distinguish submission time, chosen visit/agenda time, actual check-in and admin-entered attendance time.

## Deferred unless the owner/client reopens
Admin unlock ("Buka Kunci"), performance and staging attribution work.

## Known exposure notes
`Admin/.clasp.json`, `Public/.clasp.json` (script IDs) and a fallback `TAMU_FO_URL` deployment URL in `Admin/Code.js` doGet are committed to the public repo. No access by themselves; review before client handover. Do not repeat the values.
