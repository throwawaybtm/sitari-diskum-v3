# Code map

App code is ~583 KB of .html (client JS in `<script>`) vs ~165 KB of .js. Files in one Apps Script project share globals, so a function may be defined in one file and called from another. Use `scripts/code-index.mjs` for a fresh function:line list.

## Admin (server, .js)
| File | Size | Role |
|---|---|---|
| Code.js | 57 KB | doGet, include, date/time helpers (`formatDateVal`, `formatTimeVal`, Jakarta normalizers), `nextRecordId_`, `getSpreadsheet`, `saveBase64ToDrive_`, LO assignment, dashboard + master data reads, `getTamuList`/`mapVisitRow_`, meeting schedule CRUD (create/update/postpone/reschedule/lock/cancel), presensi submit, SPPD list/upload/sign-offs |
| VisitWorkflow.js | 10 KB | Workflow stages, `validateVisitFile_`, booking validation, roster, `isTddVisit_` |
| VisitWorkflowStorage.js | 18 KB | `requireVisitAdmin_`, dev-mode checks, Alur_Kunjungan read/save, booking, SPPD evidence sync, visit attendance |
| AgendaDocuments.js | 19 KB | Notula context/save, agenda photos, TDD photos, schedule history |
| AgendaAttendanceData.js | 12 KB | Attendance hierarchy ordering, time parts, cutoff rule |
| MeetingRooms.js | 7 KB | Rooms, schedule validation, lock/end checks, attendance availability |
| Setup.js | 5 KB | Sheet headers and Drive folders |
| AutoSort.js, VisitArchive.js, VisitNotifications.js, DocumentSharing.js, EmployeeImport.js, PublicApi.js | small | sort triggers, archive PDF, Fonnte, public doc sharing, employee import, public read APIs |

## Admin (client, .html)
| File | Size | Role |
|---|---|---|
| Index.html | 148 KB | Dashboard shell, tabs, Buku Tamu (`renderRecentTamu`, `getSortedTamu`, `renderVisitRow`, `renderTamuTable`), meetings list + modals, SPPD table/modal, QR tools. **Never read whole.** |
| NotulaPdf.html | 99 KB | Official E-Notula composer + PDF (A4) |
| Stylesheet.html | 42 KB | All Admin styles (client-approved look) |
| Presensi.html | 41 KB | Attendance form (also copied to Public) |
| VisitModal.html | 40 KB | Visit workflow modal, documents/uploads, booking |
| TddModal.html | 22 KB | TDD detail/edit and photos |
| Tools.html, BookingCalendar.html, ArchiveClient.html, VisitAttendance.html, AgendaAttendance.html, MeetingPhotos.html, RapatPimpinan.html, AttendancePolicy.html, AgendaSearch.html, MobileBase.html | small | monthly report, calendar, archive downloads, manual attendance, photos, Rapat Pimpinan autofill, attendance rules, search, mobile base |

## Intake
- `Tamu-Luar/Index.html` (TLD form; two required document slots, 5 MB, PDF/JPG/PNG/WebP/HEIC, base64 payload) and `Tamu-Luar/Code.js` (`registerTamuLuar`, `saveBase64ToDrive_`, `getSuratFolder_`, visit code, `nextRecordId_`).
- `Tamu-FO/Index.html` (TDD form) and `Tamu-FO/Code.js` (`registerTamuFo`).
- Intake logic (`TLD_MAX_UPLOAD_*`, `validateTldUpload_`, `normalizeTldUploads_`, `validateTldRequiredFields_`, `prepareTldVisit_`, `prepareTddVisit_`, the public directory getters) is tracked in `Tamu-Luar/IntakeRules.js` and `Tamu-FO/IntakeRules.js`. The private `Destinations.js` files hold only their data array (build and `setup-local.js --check` enforce it); templates in `config-templates/`.

## Private, gitignored (never read; restore from the owner's secure channel)
`Admin/DeploymentConfig.js`, `Admin/EmployeeDirectory.js`, `Admin/PublicIntake.js`, `Admin/VisitPicContacts.js`, `Tamu-FO/Destinations.js`, `Tamu-Luar/Destinations.js` (+ preview JSON and three private tests). Templates: `config-templates/**.example`. Check with `node local-test/setup-local.js --check`.

## Local harness
`local-test/server.js` (preview at 127.0.0.1:4173, `/mobile-preview`; in-memory writes), `setup-local.js --from-templates`, `run-synthetic-tests.js`, fixtures, `vendor/` (pdf-lib, jsPDF; minified, deny-listed).
