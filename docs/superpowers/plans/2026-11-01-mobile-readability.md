# Mobile Readability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User approved implementation and local preview; no further execution-method confirmation needed.

**Goal:** Make every feature readable and tappable on phones while preserving desktop appearance.
**Architecture:** Reuse the existing HTML and workflow. Add media-scoped CSS below 768px, semantic hooks where needed and a phone-only sort control using existing sorting state.
**Tech Stack:** Apps Script HTML, Tailwind, CSS, JavaScript, Node local harness.
**Spec:** `docs/superpowers/specs/2026-11-01-mobile-readability-design.md`

## Global constraints

Phone changes only below 768px. Preserve palette, workflow permissions, desktop layout and report exports. Originally local preview only; user subsequently authorized publishing and live phone-width retesting. Backup all four source directories. No Git repository: retain ZIP and validation ledger instead of commits/worktrees.

## Review focus

Long department names must wrap; disabled actions remain disabled; empty table states stay visible; phone sorting preserves active order; modals and exports retain all data hidden from compact guest cards.

### Task 1: Admin phone layout and sorting

Files: `Admin/Stylesheet.html`, `Admin/Index.html`, `Admin/VisitModal.html`, `Admin/VisitAttendance.html`, `local-test/test/mobile-readability.test.js`.
Interfaces: `setMobileTamuSort(key,direction)` updates `tamuTableState` and calls existing render; existing desktop sorts synchronize phone selectors.

- [x] Back up sources and capture desktop baseline.
- [x] Write/run failing sort behavior tests and phone/desktop style boundary checks.
- [x] Add phone-only card, dashboard, meeting, report and modal styles; retain all controls and readonly rules.
- [x] Add phone-only sort selector; sync desktop/phone order. Run targeted tests.

### Task 2: Standalone forms

Files: `Tamu-Luar/Index.html`, `Tamu-FO/Index.html`, `Admin/Presensi.html`.
Interfaces: existing form IDs, validators and submissions unchanged.

- [x] Add phone-only typography, stacked fields, larger checkbox labels, buttons, file controls and success dialogs.
- [x] Verify every new style rule is phone-scoped and existing desktop styles remain byte-identical outside additions.

### Task 3: Verify local preview and review

- [x] Full test suite; parse rendered scripts; inspect desktop and 320/360/390 phone widths for every tab and standalone form, workflow/manual modals, QR, report and scheduling modal.
- [x] Verify long text, empty/loading states, hidden labels, sort direction, action reachability and unchanged export layout.
- [x] Fresh final code review; fix important issues and rerun relevant tests.
- [x] Record evidence and provide local URL. Subsequently publish all three existing GAS deployments and retest, as requested.
