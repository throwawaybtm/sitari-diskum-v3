# TDD Form Revision Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the TDD form to the revised TLD experience, including nine multi-select destination/PIC cards and mandatory visitor data, while preserving automatic FO arrival timestamps.

**Architecture:** Render public destination/PIC information from a server-only FO directory. Resolve selected recipients on the server and keep the current shared Data_Tamu schema and TDD monthly numbering. Extend the existing local harness to exercise the same FO rules and display new submissions in Admin.

**Tech Stack:** Google Apps Script V8, HTML/Tailwind/browser JavaScript, Node HTTP harness and built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-tdd-form-revision-design.md`

**Status:** Superseded by the user's simplified scope. See `docs/superpowers/specs/2026-10-26-tdd-simplified-design.md` for the implemented requirements and verification. Do not implement the broader proposals below.

## Global Constraints

- Preserve the separate Admin, Tamu-FO, and Tamu-Luar clasp projects.
- PIC phone numbers remain server-only; do not transmit WA messages.
- Retain the shared monthly TLD/TDD serial and existing sheet columns; no historical-data migration.
- Arrival time comes from the server in Asia/Jakarta; visible date/time are automatic.
- Match TLD's current compact responsive layout, equal-width cards, and `#11504a → #143238` submit gradient.
- All editable visitor fields are mandatory; select at least one destination. The SPPD declaration can be false.
- No uploads in the proposed baseline; confirm this review decision before implementation. If uploads are requested, revise the plan to include FO Drive storage, both required documents, 5 MB validation, and local request-limit coverage.
- Work locally after backup; no clasp push/deployment. Do not add a build pipeline for the directory copy.

## Review Focus

- Empty, whitespace-only, or unknown destination/data values must not create a visitor or increment assignment workload.
- Multiple and repeated destination choices must resolve to the correct unique PICs without exposing contact numbers.
- Visitors submitting across Jakarta midnight must receive the server's actual date/time and correct monthly code.
- A failed network/backend response must restore the submit button and allow retry.
- Long names and multiple recipients must fit in phone cards, the success modal, and Admin badges.

---

### Task 1: FO directory and authoritative registration

**Files:** Create `Tamu-FO/Destinations.js`; modify `Tamu-FO/Code.js`; create `local-test/test/tdd-form.test.js`.

**Interfaces:**
- `getTddPublicDestinations_(): Array<{bidang: string, pic: string}>` exposes names only.
- `prepareTddVisit_(payload): {bidang: string, pic: string, picIds: string}` validates required text, a positive integer count, and one or more recognized destinations, deduplicating in directory order.
- `registerTamuFo(payload)` accepts `tujuan_bidang: string[]`; preserves `{success, data: {kode_kunjungan, tujuan_bidang, lo_nama}}` response fields.

- [ ] Archive Tamu-FO, local-test, and the relevant Admin files in a timestamped backup; record the archive path.
- [ ] Add failing tests for all nine mappings matching TLD, private phone exclusion, empty/unknown/repeated selections, required text/count validation, and registration writing multiple destinations/PICs into the existing row columns.
- [ ] Run `node --test local-test/test/tdd-form.test.js`; confirm failures relate to missing behavior.
- [ ] Add FO server directory and validation helpers; change doGet to render public directory data through an HTML template, mirroring TLD's template approach.
- [ ] Replace round-robin selection for new TDD records with directory resolution; preserve SPPD row creation, server Jakarta timestamps, sheet sorting, and code generation.
- [ ] Verify an unchecked SPPD declaration creates no SPPD row; confirm midnight/month-boundary code behavior and absence of PIC phones from responses.
- [ ] Run the focused tests and `node --check Tamu-FO/Code.js`, `node --check Tamu-FO/Destinations.js`.

### Task 2: Revised TDD form and local integration

**Files:** Modify `Tamu-FO/Index.html`, `local-test/server.js`, `local-test/fixtures.js`, `local-test/tld-directory.js`, `local-test/test/server.test.js`, `local-test/test/fixtures.test.js`, `local-test/README.md`; create `local-test/tdd-directory.js` if needed to keep FO rules separate from TLD upload validation; extend `local-test/test/tdd-form.test.js`.

**Interfaces:**
- `GET /tamu-fo` serves FO HTML with only the public directory substituted.
- `POST /api/registerTamuFo` accepts the revised payload and returns all selected PIC names; `getTamuList` and `getDashboardData` reflect the new record.
- Form: `tujuan_bidang` checkboxes use FormData.getAll; field IDs and response targets remain compatible with the current submit handler.

- [ ] Implement the exact title, description, field order/labels, required indicators, gradient button, equal-width PIC cards, and modal specified in the design.
- [ ] Show automatic read-only arrival date/time in Asia/Jakarta; refresh the display on minute/focus changes and use backend submission time when saving.
- [ ] Add local FO directory adapter and update renderer/mutation handling; preserve TLD's validated file registration and its separate body-size limit.
- [ ] Update existing successful FO test payloads to provide the new required fields and valid destination arrays.
- [ ] Add meaningful tests for local multi-select submission reflected in Admin, public contact exclusion, failed submission/retry state, and actual server arrival time overriding stale/client-provided values.
- [ ] Run `node --test local-test/test/*.test.js`; require all tests to pass, including TLD regressions.
- [ ] Restart only the verified local server process, refresh preview, and visually check phone/desktop layout, multiple selected cards, current arrival time, required-field errors, and long success-modal content.
- [ ] Record verification results and update local README; provide local preview link. Do not push or deploy.

## Review decisions

1. Accept the proposed TDD wording and mandatory fields, including “Perorangan” for visitors without an institution and self-name for solo member lists.
2. Accept automatic read-only arrival date/time rather than editable scheduled visit date/time.
3. Keep uploads absent (recommended), or explicitly request the TLD document-upload flow and revise this plan before execution.
