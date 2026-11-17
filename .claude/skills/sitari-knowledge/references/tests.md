# Tests

Baseline: `node local-test/run-synthetic-tests.js` -> 287 pass / 0 fail at 0de798d (Node 22 and 24). The runner stages tracked sources + sanitized fixtures in a temp folder, uses fictional data, blocks external fetch (`synthetic-network-guard.js`), and runs HTTP tests on loopback (a loopback-denied sandbox cannot validate HTTP paths).

Focused run: `node local-test/run-synthetic-tests.js local-test/test/<name>.test.js`
Guard hook tests: `node --test .claude/hooks/sitari-guard.test.mjs` (26).
Legacy raw command `node --test 'local-test/test/*.test.js'` depends on ignored private fixtures; do not use it for checkpoints.

Record in every checkpoint: command, branch, full SHA, pass/fail/skip counts, Node version, exit code.

## Test families by area
| Area | Test files (`local-test/test/*.test.js`) |
|---|---|
| Buku Tamu / dashboard | recent-visits, tamu-sorting, local-revision, lainnya-guest-filter, monthly-tools, subpage-navigation |
| Intake / IDs / visit codes | safe-id-generation, visit-code, tdd-rombongan, gas-merge-security, server |
| Visit workflow | visit-workflow, visit-workflow-gas, visit-workflow-integration, lazy-workflow, visit-status, visit-roster, visit-notifications |
| Documents / uploads / PDF | visit-document-preview, mobile-uploads, document-sharing, visit-pdf, archive-pdf, less-paper, enotula-official-pdf, enotula-cutoff, sppd-shortcut |
| TDD edit / photos | tdd-edit-photos, meeting-photos, meeting-photo-http |
| Meetings | meeting-schedule, meeting-time-storage, booking-calendar, rapat-pimpinan, rapat-internal-rev03, rapat-internal-rev04, retrospective-entry |
| Attendance | presensi, presensi-validation-hierarchy, presensi-pemko-opd, attendance-date-rule, attendance-timezone, admin-attendance-time, agenda-attendance, agenda-attendance-http, visit-roster |
| Access / errors | admin-testing-access, error-state-recovery |
| Mobile | mobile-preview, mobile-readability, mobile-uploads |
| Data / perf | employee-import, nov2-real-data (synthetic), performance |

Fixtures: synthetic-fixtures.js, fixtures, tdd-test-data.js, tld-test-data.js, meeting-test-data.js.
