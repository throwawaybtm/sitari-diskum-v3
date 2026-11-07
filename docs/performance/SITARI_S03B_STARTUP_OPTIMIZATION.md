# SITARI DISKUM v3 — S03B startup data optimization

Date: 7 November 2026, Asia/Jakarta. Branch: `perf/s03b-startup`. Approved base: `4e6eacaa73fb03d2f5c6cfd422f16c9e161ade7a` (S03A).

## 1. Findings and selected scope

The [S01 audit](SITARI_PERFORMANCE_AUDIT.md), [S02 baseline](SITARI_S02_PERFORMANCE_BASELINE.md), and [S03A report](SITARI_S03A_CALENDAR_OPTIMIZATION.md) identify overlapping reads, broad payloads and eager rendering. This phase implements a bounded change: the Admin uses a new lightweight summary endpoint that skips unused LO statistics. All existing endpoint response contracts remain intact. Three independent parallel startup requests remain, with summary readiness independent of list/calendar completion.

The starting working tree was clean, the approved branch/commit was verified, and the requested branch was created from that commit. No deployment, production request, Sheets/Drive access, notification, authentication change, library update, migration or merge to `main` occurred. This is a local source/test/measurement delivery. UI markup and styles are unchanged.

### Dependency and consumer review

| Path / consumer | Fields or dependency | Finding / treatment |
|---|---|---|
| `Index.html::initializeApp` | QR setup, room cards, `loadAllDashboard`, local timer/focus rerenders | Retained; timer/focus are not backend polling. |
| `loadAllDashboard` summary callback | `stats` counts, SPPD counts; `todayMeetings`; `recentTamu` plus revision patches | Identical fields/values/order retained. Callback renders independently. |
| `getDashboardData` | Visits, raw/display meeting rows, SPPD, employee master | `loStats` had no Admin consumer; its employee read/transform is skipped only in the new summary path. Legacy endpoint retains it. |
| Visitor table/search/sort | Complete `allTamuData`, all types/statuses, comma-OR/date filtering, sort state | `getTamuList` unchanged, with no row truncation or projection. |
| Monthly report/PDF/image | `Tools.html::monthlyGuestRows/renderMonthlyReport/exportMonthlyReport` consumes the full visit list | Complete list retained, report calculations unchanged. |
| Recent visit/detail | Shared visitor rows, `openRecentVisitDetail`, read-only cached modal snapshot, fresh workflow RPC | Full recent projection and full visitor list/Drive references retained. |
| Calendar and booking | `allRapatData`, S03A document index, photos, manual attendance, notula/status, times and room names; `BookingCalendar.html` also joins visits | Calendar response and matching code unchanged. |
| Other calendar consumers | `ArchiveClient`, `MeetingPhotos`, `AgendaAttendance`, `VisitAttendance`, attendance/PDF/modal helpers | No fields removed; full arrays and file references retained. |
| Public routes | Bounded Public wrappers and pinned `SiTariCore` library | No new Public wrapper, privileged projection, manifest or version change. |

Unresolved overlap remains: visits are read by summary and visitor-list RPCs, and meetings are read as values plus display values by both summary and calendar. Search and report data cannot be silently truncated. Existing hidden-view render work, repeated frontend lookups, and blank-search serialization remain outside this change.

### Options evaluated

- **Selected: additive summary projection.** Removes one unnecessary service read and unused staff transformation/payload with one client RPC-name substitution. Small rollback surface; no readiness dependency or existing contract removal.
- **Shared request-scoped reads / consolidated snapshot:** would allow read reuse only inside the combined execution, not across the current three independent GAS invocations. A single response could hold the fast summary behind full calendar work and couple partial failures. This phase does not replace parallel requests or claim consolidation is faster. That broader portion is deferred for design/measurement review.
- **Shrinking existing responses / persistent caching:** removing `loStats` from the existing endpoint would change an existing response contract; shrinking visitor/calendar fields or caching mutable workflows needs a broader consumer/freshness review. Those portions were stopped at evaluation, not implemented. There is no new persistent cache.

## 2. Implementation and response compatibility

`Admin/Code.js::getDashboardData()` now delegates to private `readDashboardData_(true)`, preserving the full legacy result. New `getDashboardSummary()` invokes the same helper with LO stats disabled and removes the unused empty `loStats` property from its own response. The helper does not even access `Master_Pegawai` in that mode. Sharing this calculation keeps stats/recent/today logic consistent; it is not cross-RPC data caching or shared read reuse.

`Admin/Index.html::loadAllDashboard` requests `getDashboardSummary` instead of `getDashboardData`, with unchanged callbacks, request ordering, failure handling, selected-refresh flags and revision guards. Header refresh and existing summary refreshes benefit too. Both endpoints have no payload arguments. The existing endpoint's name, signature, fields, ordering and values are retained; the new endpoint returns a strict subset. The trailing-underscore helper is not callable through `google.script.run`.

Authorization behavior is unchanged from the pre-existing summary endpoint; this adds no data beyond what it already exposed. Public does not forward this new method, and its library pin is untouched. No file URLs or visitor details are removed from any existing response. `getTamuList` and `getRapatCalendar` remain unchanged; the S03A first-document index remains byte-identical. The Index file is identical to the approved file after reversing the two summary-name strings (request and diagnostic label), proving no desktop/mobile markup or CSS change.

The in-memory local fixture store exposes the same new projection so the regular local preview still works. S02's fail-closed measurement allowlist and browser probe recognize both summary names. Its fixtures, timing boundaries and legacy probes remain intact; the browser server accepts test-owned baseline markup/environment injection so the paired runner can reuse its CSP and safety handling.

Changed files:

- Application: `Admin/Code.js`, `Admin/Index.html`.
- Local preview/regressions: `local-test/fixtures.js`, `local-test/test/header-refresh.test.js`, `local-test/test/server.test.js`.
- Shared measurement support: `local-test/performance/s02/README.md`, `browser-server.cjs`, `instrument.js`, `synthetic.cjs`.
- S03B probes: `local-test/performance/s03b/startup.cjs`, `startup.test.cjs`, `run.cjs`, `browser-server.cjs`, `runner.html`.
- This report: `docs/performance/SITARI_S03B_STARTUP_OPTIMIZATION.md`.

## 3. Measurement environment and method

Windows `10.0.26200`, Node **24.22.0**, AMD Ryzen 7 4800H, 16 logical CPUs. Backend measurements use the same S02 synthetic fixtures, read-only service mocks and `performance.now` spans at 20/200/1,000 visits/agendas, 5N attendance rows and 70 invented employees. Dense and representative distributions are unchanged. Before uses the original summary function loaded from the approved S03A Git object; after uses the current lightweight endpoint. Unchanged visitor/calendar functions use the same source and fixtures.

Five warmups then 30 samples per version/cohort, alternating before/after order. Service counts/row/cell/byte totals are recorded separately; summary projection equality and exact unchanged list/calendar responses are asserted. The three handler times are summed to describe total mock backend work. **This sequential benchmark sum is not parallel startup wall time.** JSON serialization is measured separately; bytes are uncompressed JSON UTF-8, not Google transport bytes. No Google latency or queue/cold-start cost is simulated.

The visible browser comparison uses VS Code integrated Chromium with the same S02 instrumented rendering and paint-opportunity markers. Before loads the actual approved Index source; after loads current Index. Shared includes are unchanged. Original backend summary code handles the before summary RPC; unchanged list/calendar/workflow calls use the same current functions. The browser still sends three parallel startup requests. Server execution on localhost is synchronous/serial, unlike possible GAS scheduling.

One first-observed navigation and five warmups per version are excluded, followed by 30 valid measured scenarios each, alternating pair order. Each scenario checks six read RPCs total (three startup plus three workflow), successful authoritative workflow data, zero browser errors, and no extra request on cached-tab return. Fixtures are representative N=200. This is a real desktop browser over synthetic localhost services, not deployed GAS or phone latency. Cold-cache conditions, CPU/network throttling and independent repetitions on physical phones are not supplied.

## 4. Before/after workloads and processing

Totals below describe all three startup endpoints, before / after. No Google-service or compressed-wire size is inferred.

| Profile | N | Opens | Range reads | Rows | Cells | JSON bytes | Summed handler p50/p95 ms, before | Summed handler p50/p95 ms, after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dense | 20 | 3 / 3 | 11 / 10 | 350 / 280 | 4090 / 3460 | 39719 / 30766 | 0.799 / 0.998 | 0.735 / 1.594 |
| dense | 200 | 3 / 3 | 11 / 10 | 2870 / 2800 | 35230 / 34600 | 297328 / 288375 | 6.875 / 8.714 | 6.779 / 8.478 |
| dense | 1000 | 3 / 3 | 11 / 10 | 14070 / 14000 | 173630 / 173000 | 1446137 / 1437184 | 34.217 / 38.221 | 34.212 / 38.549 |
| representative | 20 | 3 / 3 | 11 / 10 | 322 / 252 | 4006 / 3376 | 32255 / 23302 | 0.727 / 0.790 | 0.663 / 0.709 |
| representative | 200 | 3 / 3 | 11 / 10 | 2587 / 2517 | 34381 / 33751 | 221929 / 212976 | 6.121 / 6.965 | 6.103 / 6.468 |
| representative | 1000 | 3 / 3 | 11 / 10 | 12654 / 12584 | 169382 / 168752 | 1067639 / 1058686 | 30.928 / 36.515 | 31.725 / 36.356 |

Per-summary processing (legacy full summary before, lightweight summary after):

| Profile | N | Handler before p50/p95 ms | Handler after p50/p95 ms | Mock reads p50 before / after ms | Residual p50 before / after ms | Summary bytes before / after |
|---|---:|---:|---:|---:|---:|---:|
| dense | 20 | 0.343 / 0.408 | 0.272 / 0.818 | 0.184 / 0.111 | 0.160 / 0.159 | 16968 / 8015 |
| dense | 200 | 2.561 / 3.503 | 2.479 / 3.860 | 1.167 / 1.110 | 1.376 / 1.362 | 69295 / 60342 |
| dense | 1000 | 12.394 / 15.320 | 12.092 / 14.253 | 5.498 / 5.424 | 6.712 / 6.683 | 302902 / 293949 |
| representative | 20 | 0.300 / 0.323 | 0.234 / 0.260 | 0.177 / 0.109 | 0.123 / 0.125 | 12060 / 3107 |
| representative | 200 | 2.182 / 3.039 | 2.125 / 2.450 | 1.137 / 1.069 | 1.047 / 1.054 | 19727 / 10774 |
| representative | 1000 | 10.813 / 11.329 | 10.977 / 12.852 | 5.493 / 5.470 | 5.295 / 5.461 | 53477 / 44524 |


The saving in every fixture is exactly one employee range read, 70 rows, 630 cells and 8,953 response bytes. Opens remain three and startup requests remain three. This byte saving depends on the synthetic active LO rows; real response savings depend on the actual employee distribution, which was not inspected. The employee read is avoided regardless of how many rows would have passed the LO filter.

Paired visible browser: VS Code 1.144.0 / Electron43.8.3 / Chromium150.0.7871.250, 1174 ×724 CSS pixels, DPR1; 30 samples per version, same fixture and styles. Milliseconds p50 / p95:

| Browser interval | Before | After |
|---|---:|---:|
| domContentLoaded | 420.2 / 547.7 | 416.7 / 709.5 |
| navigationToSummaryPaint | 578.6 / 703.1 | 576.5 / 897.9 |
| navigationToAllDataPaint | 578.6 / 703.1 | 576.5 / 897.9 |
| modalShellMs | 19.0 / 24.6 | 18.7 / 21.1 |
| modalAuthoritativePaintMs | 413.7 / 478.7 | 414.5 / 458.8 |
| unloadedTabPaintMs | 116.0 / 193.2 | 116.1 / 136.8 |
| attendanceTabPaintMs | 37.4 / 42.9 | 41.0 / 59.7 |
| cachedTabPaintMs | 17.5 / 68.7 | 17.7 / 32.6 |

**No browser-readiness improvement is demonstrated.** Median summary/all-data readiness is nearly unchanged; the candidate p95 is higher in this capture. No slow samples were discarded or replaced. Parallel request dispatch is retained and tested independently, but this desktop mock observation cannot predict a live Sheets/GAS tail.

| Summary RPC (callback entry) | Before p50 / p95 ms | After p50 / p95 ms |
|---|---:|---:|
| Local round trip | 24.7 / 32.3 | 22.7 / 31.9 |
| Node VM handler | 2.9 / 4.5 | 2.5 / 3.6 |
| Synchronous callback | 2.3 / 4.1 | 2.2 / 3.8 |
| Response bytes (full JSON; not milliseconds) | 19727.0 / 19727.0 | 10774.0 / 10774.0 |

First observed navigation, excluded from distributions (not a cold-cache claim): before summary/all-data 515.0 / 515.1 ms; after 523.6 / 523.6 ms.


Browser summary readiness means the summary callback completed followed by two animation-frame opportunities. All-data readiness requires the startup trio then two frames; it includes hidden-tab rendering. Neither proves full interactivity, settled fonts or actual presentation. RPC spans include localhost transport, serialization/parsing and browser/Node scheduling; named renderer spans cover synchronous JS/DOM work. Nested spans cannot be summed. The one-shot startup marker cannot be overwritten by later workflow RPCs. External asset timing entries with zero values are unavailable attribution, not instantaneous loads or proof of cache hits. Static CDN/font/logo requests are permitted, while CSP blocks live GAS/Drive frames, external connections, forms and QR-service images; the synthetic document preview stays local.

These distributions are descriptive local measurements. Small differences or overlapping tails do not establish a statistically reliable end-to-end improvement, and nothing here establishes production speed gains. The justified result is reduced unnecessary startup work with parallel readiness preserved.

## 5. Regression validation

Tests were added before implementation and failed because the lightweight endpoint did not exist and startup still used the legacy RPC. New coverage verifies full legacy-response equality and lightweight projection equality for all six cohorts; no employee-sheet access; empty tables; independent summary readiness; each endpoint's isolated failure; reverse-order summary and calendar responses; and identical desktop/mobile markup. Existing header-refresh tests now expect the new summary name and retain partial-failure/button-release assertions. Local HTTP read tests include both summary endpoints.

The full available suite includes authorized private local configuration/test originals, S02 probes and all S03A regressions. It covers dashboard stats, complete monthly reports, full-list OR/date search and sorting, recent-detail navigation, document URLs, cancellation/notula/photo states, date/time/display-value fallbacks, auth/Public wrappers, attendance/workflow version rules, failures and stale responses. Test mutations use mocks and in-memory local servers only. Private files, raw diagnostics, traces and logs remain excluded from Git.

**208 tests passed, zero failed/skipped**, across 42 existing JavaScript test files, the nine S02 checks, seven S03A checks and five new S03B checks. Both browser cohorts produced 30 valid scenarios with six RPCs each and no errors. The test-only baseline/candidate HTML server retains the original CSP and read-only RPC allowlist; no production service was used.

An independent whole-branch review found no blockers and reran 23 targeted tests successfully. Hash checks confirmed 52 other application/configuration files unchanged; the approved S03A calendar body is unchanged. The reviewer confirmed the reported workload/timing values and the absence of a demonstrated end-to-end speedup.

Reproduce from the repository root:

```powershell
node --test local-test/test/*.test.js local-test/performance/s02/harness.test.cjs local-test/performance/s03a/calendar.test.cjs local-test/performance/s03b/startup.test.cjs
node local-test/performance/s03b/run.cjs
node local-test/performance/s03b/browser-server.cjs
```

Open `http://127.0.0.1:4174/` in VS Code's integrated browser, keep it visible, and run the pair comparison. Save the two numeric batches from `/results` under ignored `outputs/performance-s03b/`; stop the loopback server afterward. No packages, credentials or private configuration are required for the S03B probes. The full pre-existing suite needs the authorized files described in [repository baseline exclusions](../REPOSITORY_BASELINE.md). Git must contain the approved base object for the original-function/HTML oracle. Do not aim these probes at production.

## 6. Remaining bottlenecks and S03C recommendation

This intentionally leaves most startup work intact: duplicate visitor/meeting scans, complete list payloads, all-attendance scans, hidden-view DOM generation, runtime CSS/assets, GAS scheduling/transport, initialization guards and Drive preview costs. The helper refactor preserves shared business logic but adds a small wrapper; not every local processing sample must be faster. Existing legacy callers still pay for LO stats. Future release must include the new endpoint and caller in the same Admin version; no release is performed here.

For S03C, first collect safe staging spans and a browser Performance trace as described in S02, without invoking unknown production initialization. The next bounded code candidate is empty-search and repeated frontend lookup work using existing complete arrays: preserve exact OR/date/search/sort results and approved DOM output, and test input-to-paint on representative phones. If Sheets/RPC costs dominate instead, propose a separately reviewed combined read snapshot with independent result/error contracts and measured summary-first readiness before replacing the current parallel path. Do not silently paginate or cache mutable approvals, and do not start Firebase migration from these synthetic timings.

No application deployment, live records, permissions, library versions or `main` branch were changed for this delivery.
