# Review presensi SI-TARI — 1 November 2026

Reviewed current local source corresponding to Admin deployment v11. Scope: how attendance works, its links to other features, and gaps to discuss. No app changes, live attendance submissions, status changes or deployments were made for this review.

## 1. Two attendance flows share one database

| Flow | Who attends | How names are provided | Admin review |
| --- | --- | --- | --- |
| Internal meeting | Diskum staff, Pemko OPD participants, other guests | Diskum: department/unit → employee. Pemko: OPD plus entered personal details. Other guests: entered name/institution. | No equivalent dedicated internal-meeting attendance results table was found in the current Admin UI. Records are saved to Data_Presensi. |
| TLD visit | Registered delegation leader and members | Names come from the TLD request; guest selects their registered name. Admin may mark several people through Presensi Manual. | Buku Tamu → EDIT → KEDATANGAN. |

Both use the Admin project's Dashboard Presensi page and `Data_Presensi` sheet. TDD/FO registration is recorded as Non-SPPD visitor intake; it does not automatically create a meeting, delegation attendance roster, or this Kedatangan/SPPD workflow.

## 2. End-to-end TLD flow

1. **Form TLD:** stores institution, leader, member names, headcount and requested schedule in Data_Tamu. This request supplies the attendance roster; sending the form is not an attendance check-in.
2. **Konfirmasi → Disposisi → Notifikasi:** admin assigns departments/PICs and processes the request. PIC notifications must complete before the room-booking action is allowed.
3. **Room booking:** creates an agenda in Data_Rapat with code `VISIT-<kode_kunjungan>`. Its numeric agenda ID is also saved in the visit workflow's `booking.id`. The visit becomes Menunggu Kedatangan.
4. **Jadwal Rapat → Presensi QR:** generates `?page=presensi&id=<agenda ID>`. Scanning locks the form to that agenda; the guest does not need to choose it. The general Dashboard Presensi link has no ID and lets the user select an agenda.
5. **TLD form mode:** the agenda is recognized as a visit, Diskum/Pemko categories are disabled, institution is filled automatically, and the person chooses the leader/member from the original request. Previously recorded people are disabled in the dropdown. Jabatan is an optional text field.
6. **Alternative: Presensi Manual:** admin selects one or more registered people in Jadwal Rapat. This uses the same underlying attendance records as QR and marks their source as Admin.
7. **Kedatangan:** displays every registered person, their role, Hadir/Belum hadir, and attendance timestamp. Data is matched to this visit's agenda, not merely to the visit date. Use Muat Ulang Presensi to see later submissions; the page does not stream attendance changes automatically.
8. **VALIDASI:** requires at least one attendance entry and the scheduled end time to have passed. It records actor/time/count, locks further TLD attendance and moves the visit to Kelola SPPD. It does not require the entire delegation, or specifically the leader, to have attended.
9. **SPPD completion:** requires attendance, activity photo and a note up to 300 characters. Completion generates the attendance PDF from recorded attendees, with columns No. / Nama / Jabatan. The visit becomes Selesai.
10. **Selesai archive:** includes that attendance PDF alongside request letters, disposition, activity evidence and available E-notula. People marked Belum hadir are not included in the generated attendance list.

## 3. What links the records

| Record | Key / relationship | Purpose |
| --- | --- | --- |
| Data_Tamu | Kode Kunjungan | Original request and delegation names |
| Alur_Kunjungan | Same Kode Kunjungan | Workflow version, booking, arrival validation, evidence, history |
| Data_Rapat | Numeric ID; visit agenda code contains Kode Kunjungan | Room, schedule, title and agenda completion |
| Data_Presensi | Rapat_ID equals booking.id | Individual attendance entries for that agenda |
| Attendance identity | `ketua` or `anggota-<position>`, with normalized-name fallback | Match registered TLD people and prevent duplicate TLD check-ins |
| Master_Pegawai | Employee ID; department/unit | Internal meeting selection; 70 employees across 9 units in the supplied directory |
| Dokumen_Agenda | Agenda ID | E-notula and meeting completion |

Data_Presensi stores ID, agenda ID/title, category, name, NIP, job, institution, phone, server timestamp, visit-member ID and source (QR/Admin). Manual TLD entry currently supplies no job/phone input, so those values fall back to `-`.

Penerima Tamu/PIC is separate from the attendance roster. Assigning a PIC does not mark that employee present. For a TLD-linked agenda, the public form currently admits the delegation roster rather than the internal staff categories.

## 4. Meeting completion and visit completion are separate

- **Scheduled end passed:** the Admin UI disables the QR/manual buttons. Agenda can remain Menunggu E-notula; time passing alone does not mark the meeting complete.
- **E-notula uploaded:** agenda becomes Selesai and its QR/manual buttons stay disabled.
- **Kedatangan validated:** the visit moves to Kelola SPPD and its delegation attendance is locked.
- **SPPD finished:** visit becomes Selesai. This is separate from uploading the agenda's E-notula.

Therefore an agenda and a visitor workflow can have different completion states. This is intentional in the current implementation, but the attendance closing rule is not consistently enforced across entry paths, as noted below.

## 5. Findings to address

| Priority | Finding | Effect / recommendation |
| --- | --- | --- |
| High | Public attendance submission does not enforce scheduled end or agenda Selesai status on the server. Admin QR/manual buttons close, but an already-open or saved attendance URL can still submit. TLD arrival validation/completed visit does have a separate server lock. | Add a shared server-side attendance-window/completion check for QR and manual submissions. Also decide whether early check-in is allowed; currently no start-time restriction is applied. |
| High | Internal attendance trusts posted name/NIP/job rather than resolving a posted employee ID server-side; repeated internal submissions create repeated rows. | Resolve Diskum identity from the master directory, use a stable participant ID, and make repeat submissions idempotent per agenda. Retain the existing canonical roster checks for TLD. |
| Medium | Manual TLD attendance records no Jabatan, while the generated PDF needs that column. QR Jabatan is optional too. | Collect job titles once with the registration or allow admin to complete them before finalizing the PDF. |
| Medium | At least one attendee is enough to validate Kedatangan. No reconciliation with requested headcount or absent reasons is required. | Display requested / registered / present / absent totals and ask for explicit confirmation of partial attendance. Whether everyone must attend is a policy choice, not assumed here. |
| Medium | Internal meetings have no equivalent Admin attendance-results review/export screen or general manual-entry button. Automatic attendance PDF generation is tied to TLD SPPD completion. | Add agenda-level results and PDF export for internal meetings if the team needs the same paperless reporting there. |
| Medium | QR identifies an agenda, not the human scanning it. A registered TLD name can be claimed by whoever has the link; staff selection is also self-reported. | Treat entries as self-check-ins pending admin review. If stronger assurance is needed, consider an attendance PIN or controlled verification step. No such verification was found in the current submission path. |
| Low | Kedatangan is refreshed manually; data loaded for an open modal may remain unchanged after another device submits. The VALIDASI button can appear enabled before the end time, with the server then rejecting the action. | Refresh when entering Kedatangan or add a lightweight refresh, and show the validation time clearly on the button/hint. |
| Low | Manual attendance opens the full workflow and saves people one by one, repeatedly reading related data. | Use a dedicated roster read and a batch attendance write after validating all selections. This is a remaining performance opportunity. |

## 6. Verification and limits

- **17 relevant existing tests passed:** presensi selection, roster identity, workflow integration, manual-admin restrictions, booking/attendance links and E-notula behavior.
- An isolated probe executed the real public `submitPresensiRapat` function with in-memory Sheets/locks: a completed 2020 meeting accepted two identical internal submissions, producing two rows; the supplied NIP was stored unchanged. This confirms the first two findings without sending any live requests or writing real records.
- Probe: `node docs/validation/presensi-review-probe.cjs`; results: `docs/validation/presensi-review-probe.json`.
- Passing existing tests does not resolve the gaps demonstrated by the additional probe. No new product code or corrective changes were made.

## 7. Source map

- `Admin/Presensi.html`: general and agenda-specific page, employee cascade, visit roster and submission payload.
- `Admin/Index.html`: agenda QR generation, meeting status and enabled/disabled buttons.
- `Admin/Code.js`: public attendance submission and Data_Presensi writes.
- `Admin/VisitWorkflow.js`: roster construction, TLD duplicate matching, arrival and completion rules.
- `Admin/VisitWorkflowStorage.js`: agenda/workflow joins, public roster response, manual attendance authorization and validation locks.
- `Admin/VisitAttendance.html`: manual selection interface.
- `Admin/VisitModal.html`: Kedatangan review, refresh, VALIDASI and SPPD controls.
- `Admin/VisitArchive.js`: attendance PDF content and archive manifest.

Suggested first revision: consistent server-side closing rules, then canonical employee identity / duplicate prevention, then better attendance review and complete job titles for the paperless PDF.
