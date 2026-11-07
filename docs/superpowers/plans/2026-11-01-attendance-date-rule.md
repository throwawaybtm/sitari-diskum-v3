# Attendance opening-date rule

User request: attendance starts on the agenda's day and remains available on subsequent days. Interpret using WIB: open from 00:00 on agenda date; close only for completed/cancelled agendas or validated/completed TLD workflow. Scheduled end time alone no longer closes attendance. Existing Kedatangan validation remains after scheduled end. Records stay joined by agenda ID, independent of actual attendance date.

- [ ] Reproduce early submission in isolated public endpoint; write failing tests for future, exact WIB midnight, same day before meeting time, late attendance, completion and validation locks.
- [ ] Share a browser attendance policy between Admin and public Presensi, mirror it server-side with parity tests; apply in QR, manual entry and public submission. Preserve E-notula and meeting status behavior.
- [ ] Refresh Kedatangan when entering its tab so newly recorded attendance is shown even if the modal was already open.
- [ ] Update local parity and tests for the changed cutoff rule. Backup before editing; full suite and independent review before deployment.
- [ ] Publish Admin only and verify live delivery/read-only controls. No data reset, real attendance submission or WhatsApp send.

Backup: backups/si-tari-before-attendance-date-rule_2026-11-01.zip (506,785 bytes). No Git repository; source backup is rollback point.
