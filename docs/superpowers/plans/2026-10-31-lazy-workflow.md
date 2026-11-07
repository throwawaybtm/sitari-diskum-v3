# Faster GAS workflow plan

Approved scope: selected-visit lookup, fetch data by workflow tab, cache stable master lists. Keep immediate visitor snapshot, styling, cancellation, authorization and fresh save/version/booking validation. Source backup precedes implementation; no Git repository.

- [x] Tests first: exact row lookup reads one matching visitor/workflow row, including after row reordering; missing/partial codes cannot select another record.
- [x] Implement targeted row lookup using TextFinder on the ID column and share visitor row mapping with the list endpoint. Keep full-detail API default for attendance/save compatibility.
- [x] Tests first: tab requests fetch attendance only for Kedatangan/SPPD, rooms only for Notifikasi, agenda document metadata only for Selesai; reject unavailable/invalid tabs and require admin before reading.
- [x] Initial EDIT requests the current tab; switching to an unloaded tab fetches fresh data with a loading state. Merge same-version tab data, discard old tab data if workflow version changes, and ignore late responses after close/new selection. Full save responses mark all tab data current. Local server mirrors this contract.
- [x] Tests first: master cache hits avoid reads, expiry/cache failures safely fall back, and mutations never rely on cached rooms. Cache room/employee/OPD read responses for 120 seconds using database-specific keys; invalidate on existing master migrations.
- [x] Full suite, read-only probes, independent review; fix important findings. Push Admin to the existing GAS demo deployment, verify delivered source and perform non-mutating live checks where available. Update deployment snapshot and validation notes.

Follow-up opportunities outside this pass: consolidate initial dashboard reads, static CSS build. No migration, data reset, WhatsApp send or release permission changes.

Completed: 126/126 tests, independent review with no Important/Critical findings, local API smoke check, Admin GAS v11 and live browser EDIT/current-stage plus lazy Konfirmasi check. No live mutations or WhatsApp sends.
