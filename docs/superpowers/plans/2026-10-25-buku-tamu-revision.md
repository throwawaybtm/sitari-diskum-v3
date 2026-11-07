# Buku Tamu Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise the Buku Tamu header/table and generate shared monthly `TLD`/`TDD` visit codes in the two standalone intake apps.

**Architecture:** Each standalone project receives the same pure code-building helper plus a small sheet reader, keeping the deployable projects independent while deriving the next serial from their shared `Data_Tamu` sheet. The Admin app changes only presentation and uses a pure client formatter for compact visit dates.

**Tech Stack:** Google Apps Script, Google Sheets, HTML/Tailwind, Node.js `node:test` and `vm`.

**Spec:** `docs/superpowers/specs/2026-10-25-buku-tamu-revision-design.md`

## Global Constraints

- Keep the current spreadsheet schema and historical IDs unchanged.
- Use scheduled visit month and Jakarta dates.
- Share serial discovery across `TLD` and `TDD`; accept the documented rare cross-project race.
- Preserve form destinations, visitor fields, LO assignment, SPPD behavior, sorting, and actions.
- Do not push or deploy during local implementation.

## Review Focus

- Mixed `TLD` and `TDD` codes in one month must advance one shared maximum.
- Codes from other months, malformed codes, and legacy `TM-*` codes must not affect the counter.
- Serial `999` must advance to `1000` without truncation.
- Both standalone projects must implement the same observable code contract.
- Admin compact-date formatting must accept ISO date or ISO timestamp text without changing the displayed time.

---

### Task 1: Shared monthly visit-code contract

**Files:**
- Create: `local-test/test/visit-code.test.js`
- Modify: `Tamu-FO/Code.js`
- Modify: `Tamu-Luar/Code.js`

**Interfaces:**
- Produces: `buildVisitCode_(prefix: 'TLD'|'TDD', dateValue: string, existingCodes: string[]): string` in both standalone projects.
- Produces: `generateVisitCode_(sheet, prefix, dateValue): string`, reading column 2 of `Data_Tamu` and delegating to `buildVisitCode_`.

- [ ] **Step 1: Write failing tests against both real project files**

Load each `Code.js` in a Node `vm` context and assert shared mixed-prefix increments, monthly reset, legacy/malformed exclusion, `999` expansion, and invalid input rejection.

- [ ] **Step 2: Run Task 1 tests and verify RED**

Run: `node --test local-test/test/visit-code.test.js`

Expected: FAIL because `buildVisitCode_` does not exist.

- [ ] **Step 3: Implement identical pure and sheet-backed helpers**

Add the two interfaces to both standalone projects and replace the random suffix generation with `TDD` for FO and `TLD` for outside visitors.

- [ ] **Step 4: Run Task 1 and full tests**

Run the focused file, then `node --test local-test/test/*.test.js`.

Expected: all tests PASS.

### Task 2: Buku Tamu header, table, and compact date

**Files:**
- Modify: `local-test/test/server.test.js`
- Modify: `Admin/Index.html`
- Modify: `Admin/Stylesheet.html`

**Interfaces:**
- Produces: `formatVisitDateCompact(value: unknown): string` in Admin client code.
- Consumes: existing visit objects and existing form-opening/tab functions unchanged.

- [ ] **Step 1: Write failing rendered-contract and formatter tests**

Assert the icon/title/description/button labels, seven desktop headings, seven mobile labels, preserved handlers, and `formatVisitDateCompact` outputs `25102026` for both `2026-10-25` and an ISO timestamp while retaining a safe fallback.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="Buku Tamu" local-test/test/server.test.js`

Expected: FAIL on the legacy header/title/columns or missing formatter.

- [ ] **Step 3: Apply the minimal Admin presentation changes**

Edit the Buku Tamu header, buttons, table headings, matching mobile labels, add the formatter, and call it only for the visit date in `renderTamuTable`; leave the time expression unchanged.

- [ ] **Step 4: Run focused and complete verification**

Run the focused test, `node --check` on both standalone `Code.js` files, and `node --test local-test/test/*.test.js`.

Expected: all checks PASS.

- [ ] **Step 5: Smoke-test the live local page**

Confirm HTTP 200 and the approved Buku Tamu contract in rendered HTML; visually confirm the local dummy table displays compact dates after its API response loads.

## Self-review result

- Spec coverage: Task 1 owns the new identifier semantics; Task 2 owns every approved UI and date-display change.
- Step scan: each task has one independent RED/GREEN cycle and explicit verification.
- Type consistency: both projects expose identical helper signatures; Admin consumes no new backend fields.
- Review focus: mixed prefixes, month boundaries, malformed legacy input, serial expansion, and ISO timestamps are explicitly tested.
- Proportion: two tasks match the two independently reviewable risks—data identity and presentation.
