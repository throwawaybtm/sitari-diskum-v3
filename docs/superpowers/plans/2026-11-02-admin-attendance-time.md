# Admin attendance time plan

Approved behavior: editable Jam Kehadiran (24-hour WIB), default meeting start time, stored against agenda date. Participant QR attendance retains automatic timing.

Use a protected Admin `?page=presensi-admin` route and `submitAdminPresensiRapat` endpoint; public form stays separate. Record admin individual entry as AdminEntry so it does not trigger the existing bulk-manual QR lock. Keep actual submission time separately for traceability. Preserve existing attendance/visitor validation and retrospective-entry rules.

- [x] Add failing backend/local tests for manual hour, agenda date, validation, auth and QR behavior.
- [x] Implement protected Admin route, form field/default and endpoint, plus local preview equivalent.
- [x] Run full tests, focused review and VS Code checks; publish pinned core/public versions and verify live routes without creating attendance records.
- [x] Update snapshots, registry and report. Physical-phone controls remain a user-device check.

Completed: Admin35 / Public14 / pinned backend34. 175 tests passed, review no important findings; local form default09:00 and date verified. Backup excludes locked runtime log files. Live validation details in docs/validation/2026-11-02-admin-attendance-time.md.
