# Local Dummy Data Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only mock API that displays clearly labeled dummy records through the current Si Tari v33 Admin UI, then archive the verified baseline without exposing fixtures to clasp or live services.

**Architecture:** A top-level `local-test/` harness will sit beside—not inside—the three GAS projects. A fixture module will own all dummy records, while a Node HTTP server will render the existing Admin templates locally and answer the app's existing `/api/<function>` fallback calls using the same response shapes as `Admin/Code.js`.

**Tech Stack:** Node.js 24 built-in modules (`http`, `fs`, `path`, `node:test`), existing HTML/CSS/JavaScript, PowerShell archive verification.

**Spec:** `docs/superpowers/specs/2026-10-25-local-dummy-data-design.md`

## Global Constraints

- Keep every dummy record and mock-server source file outside `Admin/`, `Tamu-FO/`, and `Tamu-Luar/`.
- Prefix fictional organizations, people, codes, and visible descriptions with `[DUMMY]` or an unmistakable test marker.
- Do not call GAS, Google Sheets, Google Drive, Fonnte, or any deployed URL.
- Use only Node.js built-in modules; install no dependencies.
- Generate “today” values in the `Asia/Jakarta` timezone.
- Do not push or deploy any GAS project during this plan.
- This workspace has no Git repository; verified tests and the final hashed ZIP are the implementation checkpoints instead of commits.

## Review Focus

- A test run near midnight UTC must still use the correct Jakarta calendar date.
- Unknown API function names must return a structured 404 response and never fall through to a live service.
- Malformed JSON request bodies must return a controlled 400 response without crashing the server.
- Local template rendering must leave no `<? ... ?>` GAS tags in the HTML.
- Fixture identifiers must never appear anywhere under the three clasp project directories.

---

### Task 1: Time-aware fixture contract

**Files:**
- Create: `local-test/fixtures.js`
- Create: `local-test/test/fixtures.test.js`

**Interfaces:**
- Produces: `createFixtureStore(now?: Date): FixtureStore`
- Produces: `FixtureStore.responses`, keyed by `getDashboardData`, `getTamuList`, `getRapatCalendar`, `getSppdList`, and `getMasterData`.
- Produces: `FixtureStore.handleMutation(functionName: string, payload: object): object` for safe simulated scheduling and attendance responses.

- [ ] **Step 1: Write failing fixture-contract tests**

Use `node:test` assertions to require:

- Jakarta-formatted “today” meeting and visit dates for a fixed UTC instant;
- at least one FO visitor and one outside visitor;
- incomplete, pending, and verified SPPD examples;
- `[DUMMY]` markers on visible names/codes;
- response keys and nested statistic names matching `Admin/Code.js`;
- simulated mutations returning `success: true` without external identifiers.

- [ ] **Step 2: Run the fixture test and verify failure**

Run: `node --test local-test/test/fixtures.test.js`

Expected: FAIL because `local-test/fixtures.js` does not exist.

- [ ] **Step 3: Implement `createFixtureStore(now = new Date())`**

Create a compact coherent dataset and derive dashboard statistics/recent lists from the same in-memory arrays so values cannot contradict each other. Use `Intl.DateTimeFormat` with `timeZone: 'Asia/Jakarta'` for runtime dates.

- [ ] **Step 4: Run the fixture test and verify success**

Run: `node --test local-test/test/fixtures.test.js`

Expected: all fixture-contract tests PASS.

### Task 2: Local template renderer and mock API server

**Files:**
- Create: `local-test/server.js`
- Create: `local-test/test/server.test.js`
- Read: `Admin/Index.html`
- Read: `Admin/Presensi.html`
- Read: `Admin/Stylesheet.html`

**Interfaces:**
- Consumes: `createFixtureStore(now?: Date)` from Task 1.
- Produces: `renderAdminHtml(options?: { baseUrl?: string }): string`.
- Produces: `createLocalTestServer(options?: { now?: Date }): http.Server`.
- Serves: `GET /` and `GET /?page=presensi`.
- Serves: `POST /api/<functionName>` for the read functions and safe simulated `simpanJadwalRapat` / `submitPresensiRapat` mutations.

- [ ] **Step 1: Write failing renderer and HTTP tests**

Use an ephemeral port and assert:

- `/` returns the current Admin HTML with `Stylesheet.html` expanded;
- local `appUrl`, `tamuFoUrl`, and `tamuLuarUrl` substitutions are present;
- no GAS template delimiter remains;
- all five read endpoints return HTTP 200 and `{ success: true }`;
- malformed JSON returns HTTP 400;
- an unknown function returns HTTP 404;
- the two allowed mutation endpoints return simulated success and make no network request.

- [ ] **Step 2: Run the server test and verify failure**

Run: `node --test local-test/test/server.test.js`

Expected: FAIL because `local-test/server.js` does not exist.

- [ ] **Step 3: Implement `renderAdminHtml(options)`**

Read the existing templates at request time, replace the stylesheet include, replace all GAS URL expressions with local test URLs, and reject output that still contains `<?` or `?>`.

- [ ] **Step 4: Implement `createLocalTestServer(options)`**

Route only the documented pages and API names, limit request-body size, parse JSON safely, emit JSON with explicit status codes, and bind to `127.0.0.1`. The CLI entry point uses port `4173`, or the integer in `PORT` when supplied.

- [ ] **Step 5: Run the focused server test**

Run: `node --test local-test/test/server.test.js`

Expected: all renderer and HTTP tests PASS.

- [ ] **Step 6: Run the complete local harness test suite**

Run: `node --test local-test/test/*.test.js`

Expected: all tests PASS with no outbound-network requirement.

### Task 3: Operator instructions, isolation audit, and baseline archive

**Files:**
- Create: `local-test/README.md`
- Create: `backups/si-tari-v33-local-test-baseline_2026-10-25_<HHmmss>.zip`

**Interfaces:**
- Consumes: the passing harness from Tasks 1–2.
- Produces: one launch command, one local URL, shutdown instructions, safety notes, and a verified baseline archive with SHA-256.

- [ ] **Step 1: Write the local testing instructions**

Document `node local-test/server.js`, `http://127.0.0.1:4173/`, the non-persistent nature of simulated mutations, and the rule that only the three GAS directories are pushed with clasp.

- [ ] **Step 2: Verify JavaScript syntax and tests**

Run:

- `node --check local-test/fixtures.js`
- `node --check local-test/server.js`
- `node --test local-test/test/*.test.js`

Expected: both syntax checks exit 0 and all tests PASS.

- [ ] **Step 3: Verify clasp isolation**

Run `npx.cmd --yes @google/clasp status` inside `Admin/`, `Tamu-FO/`, and `Tamu-Luar/`.

Expected: none of the three tracked-file lists contains `local-test/` or fixture files.

- [ ] **Step 4: Verify production directories contain no fixture markers**

Run: `rg -n -F '[DUMMY]' Admin Tamu-FO Tamu-Luar`

Expected: exit 1 with no matches.

- [ ] **Step 5: Smoke-test the running server**

Start the server on `127.0.0.1:4173`, request the Admin page and each read endpoint, confirm the page contains rendered markup and API responses contain dummy markers, then stop the server cleanly.

- [ ] **Step 6: Create the baseline archive**

Create a timestamped ZIP containing `Admin/`, `Tamu-FO/`, `Tamu-Luar/`, `local-test/`, `docs/`, `GLOSSARY.md`, `README.md`, and `TEAM_AUDIT_2026-10-18.md`; exclude `backups/` and temporary files.

- [ ] **Step 7: Verify the archive**

List the ZIP entries, confirm the three apps and `local-test/` are present, calculate SHA-256, and report the exact path, size, entry count, and hash.

## Self-review result

- Spec coverage: every goal, non-goal, safety constraint, test requirement, clasp isolation check, and archive requirement maps to a task.
- Step scan: each step produces one checkable result; implementation choices are limited to signatures and fixed safety behavior.
- Type consistency: Task 2 consumes the exact `createFixtureStore` interface produced by Task 1.
- Review focus: all five listed failure modes have explicit tests or audits in Tasks 1–3.
- Proportion: three independently testable tasks cover fixtures, serving, and operational verification without modifying production app files.
