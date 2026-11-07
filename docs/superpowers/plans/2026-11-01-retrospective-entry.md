# Admin retrospective visit entry

Approved design: admin may record an already-completed activity later; public guest QR attendance keeps the agenda-day rule. Actual activity date drives reports/PDFs, visible attendance timestamps are removed, audit timestamps remain internal, outdated WA is not required, and admin explicitly completes the visit after evidence is ready.

Implementation choices: add a **Kunjungan sudah terlaksana / Pencatatan Susulan** option in the NOTIFIKASI booking form. Require actual date (today or earlier) and actual room, omit unknown hours. This creates an agenda as a historical activity, not a reservation; it skips planning conflict/capacity checks and WA prerequisites. Normal planned bookings retain every existing check. Save the actual date on the visit as well as the agenda. Disposition/evidence requirements and final read-only archives remain unchanged.

Admin can add attendance to a past completed agenda until the TLD attendance is validated/finalized. Public requests still reject completed agendas. This permission is private/admin-only. Manual entry accepts optional job titles for the attendance PDF. Show name, role/job and attendance status; hide attendance/approval-recording times. No change to header clock or planned meeting time display.

- [x] Backup; tests first for historical booking/date rules, no WA call, unchanged normal booking rules and actual-date synchronization.
- [x] Model/storage/local parity for historical date-only activities and admin attendance after agenda completion; retain validated/finalized locks.
- [x] Modal mode controls, actual-date booking fields, optional manual job titles; hide attendance/approval timestamps and suppress blank-hour UI.
- [x] Test delayed registration → history agenda → attendance → validation → evidence/PDF → Selesai, with normal guest gates still enforced. Full suite and independent review.
- [x] Local browser check, publish Admin to existing GAS deployment, verify live delivery and update deployment registry.

No database migration, data reset, historical timestamp deletion or real WA send. Rollback uses source ZIP; this workspace has no Git repository. TDD/FO intake remains its separate existing Non-SPPD flow; this revision concerns the TLD Kedatangan/SPPD workflow under discussion.
