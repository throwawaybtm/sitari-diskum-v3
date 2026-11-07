# SITARI DISKUM v3 - S03C frontend responsiveness

Date: 7 November 2026 (Asia/Jakarta). Branch: `perf/s03c-frontend`. Approved base: `8c995281cf30ae8fe95ebc643bc25059e8015d1e`.

## 1. Scope and findings

Reviewed the complete S01 audit and S02/S03A/S03B reports, current Admin startup, search, list/report generators, attendance policy and consumers. The working tree was clean at the approved S03B commit; the dedicated branch was created from it. Baseline full suite: 208 passed.

Confirmed avoidable frontend work:

- `Admin/AgendaSearch.html::filterAgendaRecords_`: Object.values, nested JSON.stringify, joining and locale lowercasing ran for each date-eligible row even when the normalized keyword list was empty. Blank searches are used at startup and on search clearing.
- `Admin/Index.html::renderMeetingsList/canAdminRecordAttendance`: two eligibility calls per linked card searched the same full visitor array. Each status badge also calculated meeting status twice; closed attendance buttons repeatedly calculated the same QR availability.
- `renderTamuTable`, `renderMeetingsList`, `Admin/Tools.html::renderMonthlyReport`: generate full HTML including hidden panels. Monthly rows filter/sort/map the complete dataset. Timer/focus replaces meeting DOM from fresh local data. Search input renders synchronously on each input event.
- `initializeApp/loadAllDashboard` retains three parallel independent startup RPCs; no new RPC or backend work is needed for these changes. Runtime CSS, large DOM construction, Google transport, Drive previews and platform scheduling remain separate costs. These findings do not establish their production latency share.

## 2. Changes and deliberately unchanged portions

1. Return true immediately after the existing exact-date test when no nonempty comma-separated keyword exists. Array.filter still returns a new ordered array, including when both query/date are blank. Nonempty OR search uses the exact original haystack and locale behavior; null/nested/scalar values are not reinterpreted. Circular objects and effectful getters are not valid RPC JSON records; blank searches no longer traverse nested values.
2. Build a first-match `Map` keyed by exact `String(kode_kunjungan)` once per nonempty meeting render. A numeric ID and the same decimal string remain equivalent; whitespace/leading zeros are not normalized. Duplicate first rows remain authoritative for this display hint. Each linked card computes manual eligibility once using this render-local index. Status and QR availability are computed once per card and substituted into the identical template.
3. The optional second argument of `canAdminRecordAttendance(meeting, visitsByCode)` is used only by the synchronous renderer. All independent action callers still use the original single-argument fresh-array fallback and unchanged date policy. No index survives the render, no approval/attendance state is persisted, and backend authorization/version/attendance validation remains unchanged. Every new render rebuilds from current visitors.

The index adds O(V) transient memory and V ID reads even for a list of internal meetings where the old path made zero visitor-ID reads. This bounded fixed cost is disclosed; dense timings include it. A future optimization could build lazily if an eligible linked card exists, but no further complexity was added here. Matching work also includes V Map.has, up to V Map.set and at most one Map.get per eligible linked card: zero array scans does not mean zero work.

**Hidden rendering and redundant DOM replacement were evaluated and left unchanged.** Delaying first rendering could postpone first-tab readiness; reusing HTML needs invalidation for visitor patches, errors, date/keyword/status filters, sort state, report month/busy state, timer-derived meeting labels and phone details. A persistent output snapshot or broad deferred-render manager would expand this bounded change. No cache, debounce, pagination, skeleton, layout change or new timer is introduced. Monthly report/export calculations remain untouched. The probes quantify their remaining costs.

Exact static HTML/styles remain equal after removing script blocks, and generated visitor/agenda/report HTML matches the approved function oracle across desktop and phone fixtures. Dates, labels, actions, classes, hrefs, order and expansion state remain equal under a stable clock. All backend source, S03A calendar index, S03B summary endpoint/caller, complete payloads, public source/manifests and private configuration are retained.

## 3. Methodology and processing results

Windows 10.0.26200, Node v24.22.0, AMD Ryzen 7 4800H with Radeon Graphics. Reuses S02 synthetic backend fixtures and the actual frontend generators in Node VM with DOM stubs. Before source comes from the immutable approved S03B Git object; after uses working source. Dense/representative N=20,200,1000, 5N attendance, 70 invented employees; no private configuration or real records in probes. Five warmups then 30 alternating before/after samples per cohort, nearest-rank p50/p95. Timing is HTML/string generation only, not DOM insertion/layout/paint or GAS latency. Timed records are ordinary serialized RPC data. Operation counters run separately, using ID getters or one nested toJSON per row. These getters instrument normal reads and are not representative production payload objects.

All rows and full HTML bytes agree before/after. No slow successful samples were removed. Milliseconds p50 / p95:

| Profile | N | Visitor HTML before | After | Agenda HTML before | After | Nonempty visitor search before | After |
|---|---:|---:|---:|---:|---:|---:|---:|
| dense | 20 | 0.392 / 0.707 | 0.288 / 0.527 | 0.372 / 0.552 | 0.223 / 0.270 | 0.405 / 0.683 | 0.401 / 0.612 |
| dense | 200 | 3.880 / 5.234 | 2.759 / 3.943 | 3.600 / 5.161 | 2.168 / 3.271 | 3.873 / 5.338 | 3.765 / 4.791 |
| dense | 1000 | 18.715 / 21.379 | 13.479 / 15.813 | 17.162 / 18.274 | 10.206 / 11.365 | 18.736 / 21.536 | 18.530 / 22.873 |
| representative | 20 | 0.414 / 0.492 | 0.317 / 0.996 | 0.530 / 0.663 | 0.269 / 0.566 | 0.419 / 0.473 | 0.423 / 0.755 |
| representative | 200 | 4.862 / 5.247 | 3.684 / 4.149 | 12.098 / 14.207 | 2.612 / 3.129 | 4.896 / 5.764 | 4.792 / 6.235 |
| representative | 1000 | 25.983 / 28.687 | 20.933 / 24.141 | 219.479 / 226.488 | 12.395 / 13.736 | 26.102 / 29.129 | 26.028 / 29.591 |

| Profile | N | Blank-search nested serializations before / after | Visitor-ID reads before / after | Guest rows (both) | Guest / agenda HTML bytes (both) |
|---|---:|---:|---:|---:|---:|
| dense | 20 | 20 / 0 | 0 / 20 | 20 | 32710 / 45792 |
| dense | 200 | 200 / 0 | 0 / 200 | 200 | 328050 / 458474 |
| dense | 1000 | 1000 / 0 | 0 / 1000 | 1000 | 1642450 / 2293676 |
| representative | 20 | 20 / 0 | 220 / 20 | 20 | 32310 / 46707 |
| representative | 200 | 200 / 0 | 20200 / 200 | 200 | 323643 / 467976 |
| representative | 1000 | 1000 / 0 | 501000 / 1000 | 1000 | 1620191 / 2341559 |

| Profile | N | Blank filter before | After | Monthly report before | After |
|---|---:|---:|---:|---:|---:|
| dense | 20 | 0.101 / 0.116 | 0.002 / 0.003 | 0.053 / 0.130 | 0.051 / 0.087 |
| dense | 200 | 1.022 / 1.226 | 0.007 / 0.014 | 0.476 / 0.553 | 0.469 / 0.502 |
| dense | 1000 | 4.876 / 5.369 | 0.029 / 0.036 | 2.149 / 2.521 | 2.180 / 2.541 |
| representative | 20 | 0.101 / 0.140 | 0.002 / 0.004 | 0.018 / 0.055 | 0.018 / 0.064 |
| representative | 200 | 1.012 / 1.131 | 0.009 / 0.014 | 0.116 / 0.224 | 0.115 / 0.175 |
| representative | 1000 | 4.875 / 6.180 | 0.029 / 0.087 | 0.580 / 0.856 | 0.574 / 0.742 |

Nonempty search and monthly report logic are unchanged controls; small p95 regressions appear in some cohorts. Do not infer a universal improvement from the larger linked-agenda result. VM measurements do not prove user-visible speed gains. Backend request/read/payload work remains at the S03B baseline: three startup RPCs, three spreadsheet opens, ten range reads in standard cohorts; no production service is called.

## 4. Real local-browser comparison

VS Code integrated browser **1.145.2**, Chromium **150.0.7871.250**, Electron **43.8.3**, DPR 1. Desktop iframe **1174 x 706** CSS pixels; phone-width iframe **390 x 706**. Both use the same desktop CPU/browser. Width-only mode exercises responsive markup; it is **not physical-phone, touch, CPU or mobile-network emulation**. No controlled CPU/network throttling was available through the integrated-browser controls used. No production/browser-GAS measurements were performed.

Before loads Index and AgendaSearch from the approved S03B Git object; after loads current sources. Other includes/backend functions are identical. Reuses the S02 observer, isolated read-only server/CSP and S03B alternating navigation method. Per width: first-observed navigation plus five warmups excluded, then 30 measured pairs. Every scenario verifies three startup plus three workflow reads, fresh authoritative detail data, no RPC on cached tab return, zero browser errors and all 200 guest/agenda rows. Programmatic input events run the real oninput handlers without debounce. The extended scenario changes/clears both searches, switches tabs and repeats an identical visitor render.

Intervals end after two animation-frame opportunities: **not proof of pixels presented, physical input queue latency or TTI**. Local RPC spans include transport, serialization and scheduling; Node VM spans are not Apps Script execution. Renderer spans measure synchronous JS/DOM assignment, excluding deferred style/layout/paint. Nested spans cannot be summed. Long tasks cover the whole extended scenario, so cannot be compared directly to shorter S02/S03B totals. CDN/font/logo resource zeros remain unavailable attribution, not instant loads/cache evidence.

Milliseconds p50 / p95; 30 samples each:

| Interval | Desktop before | After | Phone-width before | After |
|---|---:|---:|---:|---:|
| domContentLoaded | 336.5 / 524.7 | 335.5 / 492.2 | 315.6 / 410.6 | 312.2 / 435.8 |
| navigationToSummaryPaint | 471.1 / 701.2 | 491.3 / 659.7 | 480.2 / 573.6 | 466.1 / 605.2 |
| navigationToAllDataPaint | 472.3 / 702.8 | 491.4 / 659.7 | 480.2 / 578.5 | 470.0 / 605.2 |
| modalShellMs | 18.6 / 21.6 | 17.9 / 35.4 | 4.1 / 5.2 | 4.2 / 6.2 |
| modalAuthoritativePaintMs | 416.0 / 447.0 | 417.2 / 465.2 | 296.4 / 320.0 | 295.0 / 321.5 |
| unloadedTabPaintMs | 116.7 / 135.3 | 121.8 / 151.0 | 197.9 / 212.2 | 195.2 / 206.8 |
| attendanceTabPaintMs | 31.4 / 50.9 | 37.7 / 56.5 | 34.0 / 67.8 | 31.9 / 89.1 |
| cachedTabPaintMs | 18.3 / 28.4 | 20.1 / 69.5 | 20.7 / 27.6 | 21.7 / 56.2 |
| guestNavigationPaintMs | 238.7 / 279.3 | 235.2 / 268.5 | 147.4 / 163.0 | 149.2 / 331.0 |
| guestSearchPaintMs | 98.8 / 143.2 | 103.8 / 247.1 | 83.3 / 159.2 | 83.0 / 149.6 |
| guestClearPaintMs | 220.4 / 270.6 | 217.5 / 277.2 | 137.8 / 148.7 | 134.3 / 150.0 |
| agendaNavigationPaintMs | 90.3 / 248.2 | 94.8 / 270.2 | 87.4 / 223.4 | 87.8 / 204.7 |
| agendaSearchPaintMs | 103.0 / 326.0 | 108.8 / 296.6 | 105.1 / 220.6 | 208.4 / 222.6 |
| agendaClearPaintMs | 247.4 / 490.9 | 244.1 / 267.5 | 189.8 / 236.0 | 101.4 / 216.1 |
| cachedNavigationPaintMs | 119.9 / 270.0 | 115.3 / 270.0 | 109.2 / 191.0 | 163.6 / 183.8 |
| repeatGuestPaintMs | 94.0 / 117.9 | 93.4 / 225.9 | 77.6 / 97.3 | 81.1 / 95.8 |

GuestNavigation repeats an already-open visitor section; agendaNavigation first opens eagerly-rendered agendas; cachedNavigation returns to visitors without RPC. switchTab still rerenders visitors to clear its status filter. This distinguishes DOM/backend reuse. No added deferred rendering or browser data cache.

| Work | Desktop before | After | Phone-width before | After |
|---|---:|---:|---:|---:|
| longTaskCount | 15.0 / 17.0 | 15.0 / 17.0 | 17.0 / 18.0 | 17.0 / 18.0 |
| longTaskMs | 1732.0 / 2071.0 | 1731.0 / 1945.0 | 1498.0 / 1634.0 | 1510.0 / 1753.0 |
| domNodeCount | 9497.0 / 9497.0 | 9497.0 / 9497.0 | 10297.0 / 10297.0 | 10297.0 / 10297.0 |
| guestRowCount | 200.0 / 200.0 | 200.0 / 200.0 | 200.0 / 200.0 | 200.0 / 200.0 |
| agendaCardCount | 200.0 / 200.0 | 200.0 / 200.0 | 200.0 / 200.0 | 200.0 / 200.0 |

Initial hidden versus subsequent visible synchronous rendering:

| Span | Desktop before | After | Phone-width before | After |
|---|---:|---:|---:|---:|
| Initial hidden guests | 13.4 / 15.8 | 12.1 / 15.5 | 14.1 / 20.9 | 12.3 / 15.8 |
| Visible guest search | 26.1 / 29.9 | 26.8 / 30.2 | 18.5 / 21.2 | 18.9 / 22.0 |
| Initial hidden agendas | 14.7 / 18.8 | 13.1 / 16.1 | 19.3 / 22.2 | 17.8 / 20.8 |
| Visible agenda search | 21.4 / 42.1 | 22.6 / 35.5 | 27.7 / 32.6 | 25.1 / 34.6 |
| Populated hidden monthly report | 0.6 / 0.9 | 0.6 / 0.9 | 0.6 / 0.8 | 0.5 / 1.0 |

First observed summary / all-data milliseconds (excluded; not cold-cache):

- Desktop: before 703.8 / 703.9; after 428.2 / 428.3.
- Phone width: before 807.8 / 807.8; after 448.3 / 448.3.

### Investigation of mixed browser results

**No general end-to-end UX speedup is established.** Desktop initial renderer work decreases, but startup median rises slightly. Phone startup p95 rises despite a lower median. Desktop nonempty guest-search p95, repeated-render p95 and some modal/tab p95 values worsen. Agenda-clear p95 is lower at both widths, but that is not sufficient to claim production improvement. All slow successful samples remain included.

The synchronous render spans are much shorter than the two-frame interaction intervals. The three slowest candidate desktop guest-search samples take about 246-252 ms while the corresponding search renderer takes about 19-23 ms. Nonempty search logic is unchanged. Initial candidate agenda-render p50/p95 is 13.1/16.1 ms versus 14.7/18.8 before, while total desktop startup median still rises. Workflow rendering remains about 0.6 ms median with unchanged code. Much of the tail therefore lies outside the optimized synchronous functions; **its specific cause remains undetermined**. Style/layout, runtime CSS mutation processing, GC, frame scheduling, assets and machine load require a Performance trace for attribution. Local Node execution is serial, unlike possible GAS scheduling.

No speculative DOM cache/deferred-render patch is added to chase these tails. Repeat isolated traces and physical-phone tests before setting an SLO or asserting a UX gain.

## 5. Replaying S03B's elevated browser p95

A separate pinned-source replay uses S03A Index/legacy summary before and approved S03B Index/lightweight summary after, **not the S03C frontend**. Both use their historical AgendaSearch source. Reuses the original S03B runner and summary function oracle with unchanged S02 fixtures, includes, observer/CSP and backend code. Desktop 1174 x 724, 30 alternating pairs after first-observed + five warmups. Same Chromium/Electron as the original report, but VS Code host is now 1.145.2 rather than 1.144.0; uncontrolled scheduling/cache/machine state prevents an exact environmental reproduction.

| Interval | Pinned S03A before p50/p95 ms | Pinned S03B after |
|---|---:|---:|
| domContentLoaded | 410.0 / 500.1 | 408.4 / 569.7 |
| navigationToSummaryPaint | 556.5 / 652.3 | 552.2 / 716.1 |
| navigationToAllDataPaint | 556.5 / 684.2 | 552.3 / 716.1 |
| modalShellMs | 17.8 / 23.5 | 17.6 / 19.8 |
| modalAuthoritativePaintMs | 407.5 / 429.5 | 405.7 / 429.7 |

**The direction of the elevated tail recurred, but the original magnitude did not.** All-data p95 is 684.2 -> 716.1 ms in this replay (the S03B report previously showed 703.1 -> 897.9). Median is 556.5 -> 552.3. DOMContentLoaded p95 also rises 500.1 -> 569.7, indicating variable cost before data readiness. This is descriptive evidence, not proof that the smaller summary endpoint causes a regression. Neither replay nor S03C justifies a broad UX speedup claim or reverting the tested work reduction. 60 valid scenarios, six reads each, zero errors; slow successes were retained.

## 6. Regression tests and boundaries

Full available suite: **214 passed, zero failed/skipped** (42 existing JavaScript files, S02/S03A/S03B tests and six new S03C tests). Authorized local private configuration/test originals were used but are not staged. Source tests use mocks/in-memory servers; no production calls or mutations occur.

- Before implementation, blank-search test failed with six nested serializations instead of zero and linked-render test failed with 30,100 ID reads instead of at most 200. Both then passed. Oracle comparisons already passed and continue passing.
- Exact full generated visitor, meeting and monthly-report HTML at all six cohorts x desktop/phone modes; complete monthly rows; OR/comma/whitespace/exact-date search; sorted output; original ordering and Drive hrefs.
- First duplicate wins; numeric/string, whitespace, leading zero, null/undefined/NaN and prototype-like IDs; missing visitor; VISIT-code fallback; closed/future/cancelled agenda; phone expanded-details preservation.
- Changed mutable visit status is reflected by both independent helper calls and the next render. No cross-render approval/attendance result cache.
- Browser server test proves approved blank-search behavior is actually served for before, optimized behavior for after, the postlude is outside embedded print templates, read summary is complete and writes are blocked. Historical replay excludes S03C changes and retains both original caller names.
- Existing suite retains search/sort/status filters, exports, recent-detail navigation, readonly preview escaping, fresh workflow/arrival validation, manual/QR/date logic, version checks, close/switch races, out-of-order replies, partial startup failures, public boundaries, display-time fallbacks, mobile/desktop behavior and room conflict rules.
- S03B's whole-file Index assertion now protects static markup/styles with script blocks removed, because S03C intentionally changes script internals. New dynamic HTML/oracle tests protect rendered templates; it is not replaced by a source-text-only assertion. S02 current-source blank-serialization budget is zero; the historical baseline remains exercised by the S03C oracle/server checks.

All backend, stylesheets, Tools/report/export source, attendance policy, Public/TLD/TDD source, private configuration and manifests remain unchanged. Application diffs are limited to Index script processing and AgendaSearch. No production Apps Script deployment, Sheets/Drive change, notification, authentication/permission change, Public library-version change, Firebase work or main merge.

## 7. Reproduction and delivery files

From the repository root with Node 24 and the approved Git objects available:

```powershell
node --test local-test/test/*.test.js local-test/performance/s02/harness.test.cjs local-test/performance/s03a/calendar.test.cjs local-test/performance/s03b/startup.test.cjs local-test/performance/s03c/*.test.cjs
node local-test/performance/s03c/run.cjs
node local-test/performance/s03c/browser-server.cjs
# Open http://127.0.0.1:4174/ in VS Code integrated browser.
# Run desktop, then check Phone-width viewport and run again; keep visible.
node -e "fetch('http://127.0.0.1:4174/results').then(r=>r.json()).then(x=>require('fs').writeFileSync('outputs/performance-s03c/browser.json',JSON.stringify(x,null,2)))"
# Stop server with Ctrl+C.
node local-test/performance/s03c/s03b-replay.cjs
# Open http://127.0.0.1:4175/, run the pinned historical comparison.
node -e "fetch('http://127.0.0.1:4175/results').then(r=>r.json()).then(x=>require('fs').writeFileSync('outputs/performance-s03c/s03b-replay.json',JSON.stringify(x,null,2)))"
# Stop replay with Ctrl+C.
```

Raw numeric samples, logs and plan/ledger remain ignored under outputs/performance-s03c. No HAR, credentials, private employee/contact data, document URLs or real records are committed. No new dependency installation. Probes need no private configuration; the full pre-existing suite requires the authorized files documented in REPOSITORY_BASELINE.md. The preview servers were stopped after collection.

Changed files (15):

- Application: Admin/AgendaSearch.html, Admin/Index.html.
- Shared probe: local-test/performance/s02/frontend.cjs (optional pinned source/phone injection, real monthly functions, exposed DOM context), browser-server.cjs (allow numeric frontend metric keys), harness.test.cjs (new empty-search work budget).
- Existing protection: local-test/performance/s03b/startup.test.cjs (static markup equality plus unchanged other startup tests).
- S03C: local-test/performance/s03c/frontend.cjs, frontend.test.cjs, run.cjs, browser-server.cjs, browser.js, runner.html, browser.test.cjs, s03b-replay.cjs.
- Report: docs/performance/SITARI_S03C_FRONTEND_OPTIMIZATION.md.

## 8. Remaining risks, acceptance and S03D recommendation

The remaining DOM remains large (9,497 desktop / 10,297 phone-width nodes after the measured interactions). Full-list filtering/string generation, synchronous DOM replacement, eager hidden content and runtime styling still incur work. Nonempty search is intentionally unchanged. Index memory grows with visitors and is rebuilt even for internal-only lists. Generated output assumes normal JSON records and a stable clock during a render; policy results are now internally consistent within each card rather than recalculated repeatedly at possible time-boundary crossings. No source of truth is moved to the frontend.

Before any release, require the full contract suite, original HTML equivalence, complete rows/reports, zero new RPCs and fresh action/server validation; collect at least 30 matched staging/phone samples per selected scenario with explicit error and p95 budgets agreed from observed baseline. Exact absolute timing assertions do not belong in the unit suite. Do not claim a UX improvement until repeated browser distributions and trace attribution support it; mixed/tail regressions remain visible in this report.

For S03D, prioritize **sanitized isolated staging attribution and a physical-phone Performance trace**, following S02 section 8: known initialized read-only test entry; synthetic Sheets/Drive; spans for RPC/handler, open/read, JavaScript transformation and optional Drive; no production doGet initialization probe. Capture input dispatch, script/style/layout/paint, long tasks, fonts/runtime CSS and modal text versus document-frame readiness. Keep raw traces/HAR outside Git and remove removable instrumentation afterward.

If traces confirm browser style/layout dominates, propose a separately reviewed asset-delivery or narrowly invalidated DOM-update experiment with identical styling and immediate first-tab readiness. If server work dominates, the next bounded code candidate is agenda-scoped attendance/context reuse for workflow tabs and archive reads, preserving authorization, roster membership, fresh attendance/version checks and existing Drive references. Do not implement both speculatively. Firebase migration/PoC remains unjustified by the present evidence.

The dedicated branch is for review only: no merge or deployment is part of this delivery.

Independent whole-branch review: all 15 changed/new files reviewed against the approved base; no Critical/Important blockers or actionable Minor findings. Reviewer independently recalculated the report figures, passed all 214 available tests and 27 focused performance checks, and confirmed clean whitespace checks. Production UX gains, physical-phone behavior, exact browser tail causes and deployment readiness were explicitly outside that review.
