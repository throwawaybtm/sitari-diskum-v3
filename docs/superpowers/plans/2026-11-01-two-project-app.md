# Two-Project SI-TARI Implementation Plan

> Use executing-plans for inline implementation and one independent review before publication.

**Goal:** Publish the approved Admin + Public Forms architecture with all pending revisions.

**Architecture:** Reuse Admin as the shared backend library and the TLD deployment as Public Forms. Whitelisted public wrappers share the backend's database and script lock; a retired TDD landing page preserves discoverability from its previous URL.

**Tech stack:** GAS V8, HtmlService, clasp, Node tests and local preview.

**Spec:** `docs/superpowers/specs/2026-11-01-two-project-app.md`.

## Constraints and rulings

- No Git repository: authorized workspace plus verified ZIP baseline replaces a worktree/commit workflow.
- Publishing existing deployments is explicitly authorized. Preserve current demo permissions; no live data reset, notification sends or new document-sharing changes.
- Ruling: use a pinned Admin library rather than duplicate attendance writers or introduce a public maintenance API. Google documents shared library lock/property instances; cost is possible library startup overhead.
- Ruling: keep source form directories for existing local tests and authoring; only Admin/ and Public/ are active app build outputs. The old TDD project is a compatibility notice, not another maintained app/backend.

## Review focus

- Public calls cannot invoke admin operations or retrieve raw workflow documents/PIC phone numbers.
- Registration/attendance use core locks and existing database properties, including shared monthly sequence and duplicate attendee checks.
- Public route parameters preserve agenda IDs; default TLD and old links remain usable during migration.
- Core/public versions stay pinned and build outputs reflect all pending UI revisions.
- Live authorization or access failures must be reported and resolved before declaring the migration complete.

## Tasks

- [x] Back up app sources, local harness and latest deployment snapshots.
- [x] Add failing routing, wrapper, build and shared-write regression coverage.
- [x] Build namespaced intake module and public project with a narrow library API.
- [x] Update Admin configuration/QR links and prepare retired TDD notice.
- [x] Run full tests, local previews and one independent review; fix important findings.
- [x] Publish Admin core, pin/build/publish Public Forms, verify live pages/RPCs and then publish the TDD notice.
- [x] Update snapshots, deployment registry and operating/rollback documentation.

## Execution ledger

Backup created before implementation; current known live versions are Admin 29, TLD 9, TDD 6. Local approved UI revisions have 152 passing tests at baseline.

Completed: Admin v30; Public v10 pinned to core v30; legacy TDD notice v7. All 157 tests pass. Independent review clean. Live public routes, Admin links, compatibility notice and public attendance metadata/roster reads verified. Snapshots, registry, source clasp archives and README updated. Detailed evidence: docs/validation/2026-11-01-two-project-migration.md. No live business writes or WA sends.
