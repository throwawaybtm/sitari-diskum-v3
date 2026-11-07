# Local Guest Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve both guest forms locally and make their submissions immediately appear in the local Admin visitor list.

**Architecture:** The local HTTP server serves the existing standalone HTML files. The fixture store owns mutable visitor state and handles both registration mutations, while its read responses are generated from current state.

**Tech Stack:** Node.js built-in HTTP server and test runner, HTML/JavaScript forms.

**Spec:** `docs/superpowers/specs/2026-10-25-local-guest-forms-design.md`

## Global Constraints

- Keep simulation code inside `local-test/`.
- Do not connect to GAS, Sheets, Drive, WhatsApp, or Fonnte.
- Submitted data persists only until the local server restarts.

## Review Focus

- Both local routes return the correct standalone form.
- Each registration response satisfies its form success modal.
- New submissions appear in `getTamuList` without restarting.
- Shared monthly serials advance across TLD and TDD submissions.
- Dashboard counts and recent visitors reflect current mutable state.

---

### Task 1: Local form routes and mutable submissions

**Files:**
- Modify: `local-test/server.js`
- Modify: `local-test/fixtures.js`
- Modify: `local-test/test/server.test.js`
- Modify: `local-test/test/fixtures.test.js`

**Interfaces:**
- Produces: `GET /tamu-fo`, `GET /tamu-luar`, `POST /api/registerTamuFo`, and `POST /api/registerTamuLuar`.
- Produces: current visitor data through `POST /api/getTamuList` and `POST /api/getDashboardData`.

- [ ] Write failing route tests for both standalone forms.
- [ ] Run the focused tests and verify route failures.
- [ ] Serve each existing form HTML from the local server.
- [ ] Write failing mutation tests that submit TDD and TLD records and then read them from `getTamuList` and dashboard data.
- [ ] Run the focused tests and verify mutation failures.
- [ ] Implement mutable fixture responses, shared monthly serial generation, and form-compatible success responses.
- [ ] Run the focused tests and the complete suite.
- [ ] Restart the local server on port 4173 and refresh the local browser view when safe UI control is available.

