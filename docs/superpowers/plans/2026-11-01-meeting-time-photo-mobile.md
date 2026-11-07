# Meeting time, photos and shared phone settings implementation plan

> Execute inline with executing-plans; one fresh review at the end.

Goal: consistent Admin-style phone defaults, faithful 24-hour scheduling with real clash protection, and required photo evidence for internal meeting completion.

Architecture: shared CSS include, canonical meeting-row read/write helpers in the existing backend, and separate agenda photo storage using the existing Drive document service. Public Forms retain a pinned Admin core. No screen-size JavaScript override or navigation changes.

Constraints: preserve desktop appearance and completed records; no live sample bookings, resets or WA sends. Internal means RPT agendas, excluding VISIT/TLD agendas. At least one image must exist before E-notula completes an unfinished internal agenda. Photos remain viewable/downloadable afterward. Multiple images allowed, existing 5 MB per-file limit, total 10 MB per upload batch. Existing completed meetings are grandfathered.

- [x] Reproduce spreadsheet-coerced Date/12-hour times; normalize stored display times and sheet-local dates once for calendar/dashboard/clashes. Write future date/time cells as text in every booking path. Test exact/partial/adjacent/cancelled/different-room cases.
- [x] Add shared MobileBase include to Admin, TLD, TDD and Presensi, retaining the main media breakpoints and readable input sizes. Wire local rendering and Public build/private include allowlist. Do not reintroduce the rejected physical-screen-width routine.
- [x] Add internal-only photo saving, validation and readback. Gate E-notula completion server-side and locally; add upload/gallery/camera actions to desktop and mobile meeting cards. Preserve visitor flow and completed legacy meetings.
- [x] Run regression tests and local VS Code checks, obtain one independent review, then publish existing deployments and update snapshots/registry/validation notes. Record physical-phone limitations honestly.

Review focus: time cells auto-coerced by Sheets and sheet timezone differences; overlap at boundaries under one script lock; photo validation before Drive writes; internal/visit distinction; photo evidence cannot be bypassed by direct RPC; public calendar excludes document URLs; desktop settings unaffected.

Ruling: require photos before uploading E-notula, rather than add another completion button. This keeps the existing E-notula completion action and attendance closure consistent. Photos are stored separately from Dokumen_Agenda so photo upload alone cannot mark an agenda complete.

Completion ledger: Admin32 / Public13 / library32 deployed. 167 tests pass. One review found ambiguous hh:mm display priority; fixed by preferring numeric values and sheet-timezone Date values, with regression coverage. Authoring-only TLD/TDD folders are not deployable standalone. Live HTTP checks pass for all routes; local desktop photo dialog and all three forms at320px visually checked. No live business writes, uploads, resets or WA sends.
