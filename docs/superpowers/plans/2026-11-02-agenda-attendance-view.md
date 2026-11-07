# Agenda attendance view

Add Lihat Presensi to every calendar agenda, internal or visit, regardless of completion. Open a read-only dialog immediately with loading, empty/error and refresh states. Show No., Nama, Tanggal, Jam; date/time dd-mm-yyyy HH:mm WIB. Read attendance event time (column10), not recording audit time (column13). Filter by agenda ID, preserving retrospective attendance. Sort chronologically, retain recorded duplicates and unknown timestamps as dashes.

- [x] Test authorization, agenda filtering and canonical/Date/ISO time formatting; implement Admin-only read endpoint and local equivalent.
- [x] Add responsive dialog and calendar button, with stale-response protection.
- [x] Run full tests, focused review and VS Code checks; deploy Admin only, retaining public project/library versions; update snapshots and report.

No public endpoint, live sample attendance, data reset, permission changes or exports.

Completed Admin36; Public14/library34 unchanged. 180 tests pass. Review local ISO formatting issue fixed. Backend filename is AgendaAttendanceData.js to avoid GAS duplicate-name rejection. Backup and validation report saved; no live attendance writes.
