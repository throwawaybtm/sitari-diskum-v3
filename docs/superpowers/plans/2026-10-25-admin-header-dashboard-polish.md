# Admin Header and Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved SI-TARI identity, simplify the Admin header, and normalize dashboard summary presentation without changing application behavior.

**Architecture:** Keep the change inside `Admin/Index.html`, using the page's existing Tailwind utility pattern. Extend the local renderer test to assert the visible contract before changing production markup.

**Tech Stack:** Google Apps Script HTML template, Tailwind CSS utilities, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-25-admin-header-dashboard-polish-design.md`

## Global Constraints

- Preserve the clock/date, Admin navigation, Buku Tamu feature buttons, backend behavior, fixtures, and standalone app directories.
- Remove only the header Cloud Edition badge, not unrelated Cloud wording.
- Use the Wikimedia Commons Batam emblem through its verified `upload.wikimedia.org` 250-pixel thumbnail URL.
- Do not push or deploy during this task.

## Review Focus

- Both desktop and mobile header shortcut groups must be absent while Buku Tamu shortcuts remain.
- All four KPI cards must lose hover-shadow highlighting.
- All four primary KPI values must use `text-2xl`, including both values inside Tipe Kedatangan.
- The rendered template must retain no Apps Script template tags.
- The remote emblem must have useful alternative text and constrained object-fit sizing.

---

### Task 1: Pin and implement the approved Admin presentation

**Files:**
- Modify: `local-test/test/server.test.js`
- Modify: `Admin/Index.html`

**Interfaces:**
- Consumes: `renderAdminHtml({ baseUrl })` from `local-test/server.js`.
- Produces: the approved rendered Admin header and dashboard contract.

- [ ] **Step 1: Add a failing rendered-HTML test**

Assert the new title, heading, description, emblem URL/alt text, absence of the Cloud Edition badge and header shortcut containers, preserved Buku Tamu buttons, four non-hover KPI cards with uniform metric sizes, and the new recent-visitor copy.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test local-test/test/server.test.js`

Expected: FAIL on the old SI-TAMU identity before product markup changes.

- [ ] **Step 3: Apply the minimal HTML/class changes**

Edit only the approved header, KPI, and recent-visitor markup in `Admin/Index.html`.

- [ ] **Step 4: Run focused and complete verification**

Run: `node --test local-test/test/server.test.js` and `node --test local-test/test/*.test.js`.

Expected: all tests PASS; rendered HTML contains no GAS template delimiters.

- [ ] **Step 5: Smoke-test the running local page**

Restart the local server if needed and confirm `/` returns HTTP 200 with the new SI-TARI identity.

## Self-review result

- Spec coverage: every approved visual and preservation requirement maps to Task 1.
- Step scan: the single task has one complete RED/GREEN cycle and one browser-facing smoke check.
- Type consistency: the existing `renderAdminHtml` interface is unchanged.
- Review focus: each likely regression is included in the rendered-contract test.
- Proportion: one task and two modified files match the small presentation-only scope.

### Task 2: Canonical navigation titles

**Files:**
- Modify: `local-test/test/server.test.js`
- Modify: `Admin/Index.html`

**Interfaces:**
- Consumes: the rendered Admin HTML from `renderAdminHtml({ baseUrl })`.
- Produces: matching desktop and mobile titles for the five existing navigation actions.

- [ ] **Step 1: Add a failing rendered-navigation test**

Assert that both navigation surfaces expose Dashboard, Buku Tamu, Jadwal Rapat, Kendali SPPD, and Lainnya while retaining the five existing `switchTab` targets.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="canonical navigation" local-test/test/server.test.js`

Expected: FAIL because the desktop and mobile navigation still contain legacy labels.

- [ ] **Step 3: Change only navigation text and mobile accessibility labels**

Keep all IDs, handlers, icons, badges, and section headings unchanged.

- [ ] **Step 4: Run focused and complete verification**

Run the focused test, then `node --test local-test/test/*.test.js`.

Expected: all tests PASS and the live page returns the five canonical labels.
