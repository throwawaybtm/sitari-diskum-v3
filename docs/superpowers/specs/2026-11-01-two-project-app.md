# SI-TARI two-project migration

User-approved structure: one Admin GAS project and one Public Forms GAS project sharing the existing database. Public Forms serves TLD, TDD and Presensi; Admin retains scheduling, approvals, documents and reports. Include all currently approved local revisions when publishing. Back up before changes; do not reset live data or send WhatsApp messages.

Reuse the existing TLD script/deployment as Public Forms. Its default route stays TLD, preserving that URL. Add `?page=tdd` and `?page=presensi&id=…`. Update Admin links and generated QR codes. Preserve the old Admin Presensi route during demo transition. The old TDD deployment becomes a migration landing page linking to the canonical TDD form; it must no longer write to the database independently.

Keep existing open demo permissions and ADMIN_DEMO_MODE until release, per the user's earlier explicit instruction. The target release architecture has restricted team access for Admin. The public project must expose only registration and attendance RPCs, with no admin action dispatcher, approval functions, tokens or private PIC contacts.

Use Admin as a versioned server-side library for the public project's narrow API. This keeps database properties, script locks, cache and all writes in the same core instance, preserving monthly numbering and QR/manual attendance deduplication. Source templates remain editable in their existing directories; a deterministic build assembles Public/ and the namespaced intake backend. Library versions are pinned for reproducible releases. Library startup has a possible performance cost, documented rather than claiming a speedup.

Official references: https://developers.google.com/apps-script/guides/libraries (resource scoping); https://developers.google.com/apps-script/guides/html/communication (library methods cannot be called directly by google.script.run).
