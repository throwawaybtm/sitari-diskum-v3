# SI-TARI less-paper implementation plan

**Goal:** Implement the requested visit workflow, document archive, search and attendance revisions.

**Architecture:** Keep the existing GAS storage adapter and shared workflow model. Keep local simulations isolated. Generate attendance PDF from stored attendance; merge original PDFs and image pages in the browser using pdf-lib, with authorized document retrieval through GAS to avoid Drive CORS restrictions.

**Decisions from the user:** KONFIRMASI sends only to the narahubung; NOTIFIKASI still sends to PICs and books a room. Fonnte is not yet configured: prepare integration, never claim an actual send. Remove physical pengesahan from the active flow. Preserve existing source documents and completed records.

**Review focus:** stale workflow versions; partial WhatsApp failures; invalid/conflicting schedule changes; missing/encrypted archive sources; search and QR scoping.

- [ ] Back up canonical projects, local harness and docs before edits.
- [ ] Add failing behavioral tests for schedule change and independent notifications, finish without signatures, unlimited-capacity PLUT room, comma-OR/date search, and PDF archive page preservation.
- [ ] Update shared rules, GAS storage and local adapter. Use existing visit ID/version locking. Schedule changes invalidate narahubung notification and are limited to confirmation before room booking.
- [ ] Add Fonnte adapter using Script Property FONNTE_TOKEN; request acceptance is distinct from delivery. No external messages during tests.
- [ ] Add Catatan (required, 300 Unicode characters), generate attendance PDF, finish directly to Selesai, replace pengesahan UI with combined archive download.
- [ ] Add E-notula upload per agenda and include it in visit archives. Retrieve only sources belonging to the selected agenda/visit.
- [ ] Add Buku Tamu and agenda search with comma-separated OR keywords and an additional exact date filter.
- [ ] Lock QR attendance to the selected agenda, disable manual attendance after meeting end, preserve attendance job titles when available.
- [ ] Add PLUT room without capacity restriction; preserve existing names and sheet IDs.
- [ ] Run complete tests and local HTTP checks; synchronize deployment snapshots and deploy Admin. Verify deployed rendering. Report Fonnte configuration gap and employee directory source honestly.
