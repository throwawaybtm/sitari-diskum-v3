# SITARI DISKUM v3 — S02 performance measurement baseline

Date: 7 November 2026, Asia/Jakarta. Approved source/audit baseline: `781679a755d13dcba4e34cb6d452888d05cb5ce9`. Measurement branch: `perf/s02-measurement`.

## 1. Findings and scope

This establishes repeatable **local synthetic** and **local real-browser** baselines, not production latency. No optimizations or performance improvements are claimed. The strongest demonstrated scaling problem is the calendar's repeated document-array scans. Startup duplicates bulk reads, attendance tabs fetch the whole attendance table, and frontend lists build all rows even when hidden. Whether these dominate the team's live experience still requires Apps Script/Sheets/Drive/transport attribution.

The complete [approved audit](SITARI_PERFORMANCE_AUDIT.md), README, repository-baseline exclusions, October performance/lazy-workflow plans, and existing performance tests were reviewed before implementing these probes. Application source, UI, business rules, authentication, library versions and deployment configuration were not changed. No production page was navigated/reloaded as a measurement, no production function was executed, and no Sheets, Drive or notification mutation occurred. An already-open production tab was replaced with the localhost runner; observing its existing screen supplied no baseline timing.

Only the removable harness/tests under `local-test/performance/s02/`, its reproduction instructions, and this report are delivered. Raw numeric diagnostics, hashes and test logs remain in ignored `outputs/performance-s02/`; no HAR or private records are committed.

## 2. Architecture and existing optimizations preserved

- Admin browser → Admin Apps Script RPC → shared Sheets/Drive. Admin EDIT does not inherently cross Public.
- Public TLD/TDD/Presensi → bounded Public wrappers → pinned `SiTariCore` Admin library. The approved audit records Admin deployment 45, Public 15, library 37. No deployment/version assertions were rechecked against live services in S02.
- `Tamu-Luar/` and `Tamu-FO/` remain authoring sources for the generated Public project; all four source directories and both project manifests remain untouched.
- Existing three parallel startup RPCs, immediate modal shell/read-only cached summary, targeted TextFinder lookups, lazy tabs, version-sensitive tab reuse, fresh Kedatangan reads, request revision guards, targeted post-save updates, and room/master caching remain intact.
- Existing `performance.test.js` protects these behaviors, including stale response/close races and cache retries. `lazy-workflow.test.js` protects tab read budgets. The harness reuses the approved audit's VM/counter technique; it does not reimplement these optimizations.

## 3. Environment, fixtures and methodology

Windows 11 (`Windows_NT 10.0.26200`), x64, Node **24.22.0**, AMD Ryzen 7 4800H, 16 logical CPUs. Browser: VS Code integrated browser **1.144.0**, Electron **43.8.3**, Chromium **150.0.7871.250**. Visible browser iframe **1174 × 724 CSS pixels**, DPR 1, desktop layout. No CPU/network throttling, controlled cold cache, mobile-device measurement or isolated machine-load guarantee.

The harness loads actual tracked Admin `Code.js`, `MeetingRooms.js`, `AgendaDocuments.js`, `VisitWorkflow.js`, `VisitWorkflowStorage.js`, `VisitArchive.js`, and `PublicApi.js` into Node VM contexts. Only synthetic in-memory services are available. Unknown/write methods, external network requests and non-synthetic database/file IDs fail closed. The normal `doGet` is deliberately never called because it contains initialization guards with possible writes.

| Profile | Visits / agendas | Attendance | Documents / photos | Purpose |
|---|---:|---:|---|---|
| Small | 20 / 20 | 100 | Profile-dependent | Team-scale check |
| Medium | 200 / 200 | 1,000 | Profile-dependent | Repeated browser scenario |
| Large | 1,000 / 1,000 | 5,000 | Profile-dependent | Scaling stress |

Every cohort has 70 invented employee rows, one synthetic stored room and one OPD row. Room normalization still uses the tracked room directory. **Dense**: all meetings today, N document rows and N photo rows. **Representative scenario**: mixed dates, six visitor statuses, alternating linked/internal agendas, document every third agenda and photo every fourth; approximately 1/7 meetings today. These ratios are designed examples, not sampled production proportions. Strings model stored date/time values; real Sheets Date/display-value cases remain tested separately. Archive retrieval uses one four-byte fake PDF prefix, not a real PDF or realistic file size.

Each endpoint: one separate counted invocation and uncounted reference with identical output asserted, five warmups, **30 timed repetitions**, reused VM, fixed cohort/endpoint order. Join callback counters are disabled during timed runs. The full CLI was run twice; all **42 endpoint/profile/cohort operation records and payload sizes matched**. Tables below use the second complete run; the first run was not combined to imply independent observations. Browser run: first observed navigation kept separately, five warmups discarded, then **30 navigation/workflow scenarios**, zero browser errors and six read RPCs per scenario. A failed development probe was discarded before final measurements; regression checks now verify that the instrumentation postlude is outside embedded print templates and that workflow RPCs cannot overwrite the one-shot startup-readiness marker. Earlier browser batches with the overwritten marker were excluded.

All durations are milliseconds, monotonic `performance.now`. Percentiles use nearest rank: sorted sample at `ceil(p × n)`, so p95 is sample 29 of 30. Small samples, warm VM, observer overhead, GC and desktop scheduling limit precision. No confidence intervals or production SLO compliance are inferred.

### Timing boundaries

| Measurement | Includes | Does not establish |
|---|---|---|
| `handlerVmMs` | Actual backend JS with mocked services | GAS cold start, queuing or execution latency |
| `mockServiceMs` | In-memory range copying/display conversion and TextFinder scan time | Real Sheets call duration; property/open/metadata overhead is not separately timed |
| `jsResidualMs` | Handler minus those mock spans, including remaining mocks/counter overhead | Pure application CPU time |
| `serializationMs` / bytes | JSON stringify separately / UTF-8 full response envelope | Compressed wire bytes or Google RPC serialization |
| Browser RPC | Localhost request through parsed response callback entry | Pure network latency or `google.script.run` overhead |
| Renderer/callback | Synchronous JS and DOM assignment | Deferred style/layout/paint cost; nested spans must not be summed |
| Two-frame readiness | Completion plus two animation-frame opportunities | Proof of actual presentation, fonts settled, TTI or physical input queue latency |
| Archive access count | One fake Drive file retrieval and base64 response | Drive network, PDF conversion, image decoding or archive merge time |

Browser intervals start at programmatic invocation of the actual modal/tab handlers. `modalShellMs` ends at synchronous shell DOM availability, **before paint**; physical click dispatch is unmeasured. Authoritative data is checked before waiting two frames. Workflow callback timing mainly resolves a promise; later `renderVisitWorkflow` timing covers its DOM work. The public library boundary is verified structurally with synthetic delegates, not timed over Google infrastructure.

## 4. Confirmed operations and payloads

For every nonempty startup cohort: `getDashboardData` **1 open / 5 range value reads**, `getTamuList` **1 / 1**, `getRapatCalendar` **1 / 5**. Thus **3 opens / 11 range reads** per startup, before any workflow opening. These counts exclude metadata/property calls and TextFinder service work; they are not a complete Google API call count.

`Data_Tamu` is read fully twice. `Data_Rapat` is read as values and display values by both dashboard and calendar: **four bulk range reads over the same agenda rows**. Two are duplicated representations within each endpoint; displayed time fallback must remain correct if this is reduced. Calendar additionally reads document metadata, photo metadata and the full attendance table. Startup endpoints perform **zero Drive file fetches** in these probes; document JSON URLs are not live Drive metadata calls.

`getVisitWorkflow(tab:0)` reads two single rows with two TextFinder searches, independent of cohort size. That already-targeted initial read should not be replaced by a full list fetch. TextFinder's mock scans arrays locally; its real server-side scan latency remains unknown. Tab 3 fetches **5N attendance rows to return five** for the selected agenda. Tab 5 reads all notula metadata to find one agenda. `getVisitArchiveDocument` repeats full workflow/attendance reads: **2 spreadsheet opens, 5 range reads, one fake Drive file fetch per file**, even when its output is tiny.

Each cell under time is p50 / p95. Bytes are full JSON UTF-8, before compression. `tab0/3/5` are explicit lazy reads; `archiveOne` is one fake file. Tabs 5/archive use a completed synthetic visit.

### dense — actual backend code in local VM

| N | Probe | Range reads | Rows materialized | JSON bytes | Handler p50 / p95 ms | Mock p50 ms | Residual p50 ms | JSON p50 ms |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 20 | dashboard | 5 | 150 | 16968 | 0.379 / 0.661 | 0.194 | 0.182 | 0.041 |
| 20 | visits | 1 | 20 | 10735 | 0.067 / 0.136 | 0.036 | 0.032 | 0.019 |
| 20 | calendar | 5 | 180 | 12016 | 0.629 / 0.860 | 0.197 | 0.432 | 0.022 |
| 20 | tab0 | 2 | 2 | 1137 | 0.027 / 0.066 | 0.005 | 0.022 | 0.005 |
| 20 | tab3 | 3 | 102 | 1869 | 0.204 / 0.233 | 0.127 | 0.077 | 0.007 |
| 20 | tab5 | 3 | 22 | 1382 | 0.041 / 0.057 | 0.017 | 0.024 | 0.005 |
| 20 | archiveOne | 5 | 123 | 106 | 0.224 / 0.334 | 0.140 | 0.083 | 0.001 |
| 200 | dashboard | 5 | 870 | 69295 | 2.587 / 4.363 | 1.184 | 1.396 | 0.140 |
| 200 | visits | 1 | 200 | 107536 | 0.569 / 0.808 | 0.350 | 0.219 | 0.181 |
| 200 | calendar | 5 | 1800 | 120497 | 27.404 / 32.707 | 2.025 | 25.404 | 0.282 |
| 200 | tab0 | 2 | 2 | 1137 | 0.022 / 0.043 | 0.004 | 0.018 | 0.005 |
| 200 | tab3 | 3 | 1002 | 1873 | 1.702 / 1.980 | 1.234 | 0.468 | 0.014 |
| 200 | tab5 | 3 | 202 | 1382 | 0.143 / 0.178 | 0.119 | 0.024 | 0.006 |
| 200 | archiveOne | 5 | 1203 | 106 | 1.813 / 1.936 | 1.339 | 0.483 | 0.004 |
| 1000 | dashboard | 5 | 4070 | 302902 | 12.597 / 13.908 | 5.806 | 6.748 | 0.949 |
| 1000 | visits | 1 | 1000 | 539537 | 2.870 / 3.068 | 1.773 | 1.088 | 1.384 |
| 1000 | calendar | 5 | 9000 | 603698 | 612.961 / 637.152 | 10.057 | 602.194 | 1.671 |
| 1000 | tab0 | 2 | 2 | 1137 | 0.023 / 0.040 | 0.005 | 0.018 | 0.005 |
| 1000 | tab3 | 3 | 5002 | 1877 | 8.629 / 12.455 | 6.351 | 2.257 | 0.022 |
| 1000 | tab5 | 3 | 1002 | 1382 | 0.612 / 0.747 | 0.583 | 0.029 | 0.008 |
| 1000 | archiveOne | 5 | 6003 | 106 | 9.144 / 10.018 | 6.930 | 2.215 | 0.005 |

### representative — actual backend code in local VM

| N | Probe | Range reads | Rows materialized | JSON bytes | Handler p50 / p95 ms | Mock p50 ms | Residual p50 ms | JSON p50 ms |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 20 | dashboard | 5 | 150 | 12060 | 0.305 / 0.610 | 0.179 | 0.128 | 0.024 |
| 20 | visits | 1 | 20 | 10642 | 0.063 / 0.068 | 0.034 | 0.030 | 0.019 |
| 20 | calendar | 5 | 152 | 9553 | 0.466 / 0.584 | 0.180 | 0.284 | 0.019 |
| 20 | tab0 | 2 | 2 | 1011 | 0.022 / 0.042 | 0.005 | 0.017 | 0.004 |
| 20 | tab3 | 3 | 102 | 1875 | 0.205 / 0.214 | 0.127 | 0.078 | 0.007 |
| 20 | tab5 | 3 | 9 | 1277 | 0.033 / 0.041 | 0.009 | 0.024 | 0.005 |
| 20 | archiveOne | 5 | 110 | 106 | 0.218 / 0.259 | 0.133 | 0.084 | 0.001 |
| 200 | dashboard | 5 | 870 | 19727 | 2.202 / 2.277 | 1.142 | 1.057 | 0.045 |
| 200 | visits | 1 | 200 | 106513 | 0.548 / 0.568 | 0.334 | 0.214 | 0.175 |
| 200 | calendar | 5 | 1517 | 95689 | 12.974 / 15.156 | 1.775 | 11.199 | 0.214 |
| 200 | tab0 | 2 | 2 | 1011 | 0.022 / 0.031 | 0.004 | 0.017 | 0.004 |
| 200 | tab3 | 3 | 1002 | 1879 | 1.693 / 1.849 | 1.232 | 0.461 | 0.011 |
| 200 | tab5 | 3 | 69 | 1277 | 0.089 / 0.090 | 0.043 | 0.046 | 0.005 |
| 200 | archiveOne | 5 | 1070 | 106 | 1.790 / 2.082 | 1.278 | 0.508 | 0.004 |
| 1000 | dashboard | 5 | 4070 | 53477 | 10.831 / 14.134 | 5.524 | 5.313 | 0.129 |
| 1000 | visits | 1 | 1000 | 534375 | 2.913 / 2.977 | 1.818 | 1.084 | 1.144 |
| 1000 | calendar | 5 | 7584 | 479787 | 264.704 / 288.735 | 8.967 | 255.737 | 1.125 |
| 1000 | tab0 | 2 | 2 | 1011 | 0.022 / 0.037 | 0.004 | 0.017 | 0.004 |
| 1000 | tab3 | 3 | 5002 | 1880 | 8.546 / 9.344 | 6.270 | 2.314 | 0.023 |
| 1000 | tab5 | 3 | 336 | 1277 | 0.369 / 0.465 | 0.196 | 0.171 | 0.011 |
| 1000 | archiveOne | 5 | 5337 | 106 | 8.813 / 9.805 | 6.417 | 2.403 | 0.006 |

Mock and residual medians are separately ranked and need not sum to the handler median. In the representative 1,000-row calendar, the large residual is consistent with repeated joins; it does not show Sheets network time. Heap deltas include GC and are not peak memory. Second-run process RSS at completion: 221.4 MiB (whole CLI including VM fixtures/render work). Representative calendar median heap deltas at N=20/200/1,000: 94.8 KiB / 861.5 KiB / 4308.0 KiB. No GAS memory inference.


## 5. Browser measurements and frontend work

The isolated loopback server renders unchanged Admin files and injects test-only instrumentation in memory. It substitutes local app URLs, uses the tracked room directory, and redirects the synthetic document preview locally. CSP allows the existing public static CDN/font/logo assets but blocks outbound connections, external frames, forms and QR-service images. This removes live Google requests and changes that preview/QR environment; it does not recreate GAS iframe/authentication/network behavior.

Readiness definitions: summary panel update plus two animation frames; all-data readiness requires the summary, visitor list and calendar callbacks plus two frames. The latter includes rendering hidden-tab content. The runner uses the completed synthetic visit for read-only tab access, opens its current Selesai tab, then Konfirmasi, Kedatangan and cached Konfirmasi. It is not a benchmark of every workflow state or actual approval action.

| Local browser metric | Samples | p50 / p95 ms |
|---|---:|---:|
| domContentLoaded | 30 | 420.3 / 535.6 |
| navigationToSummaryPaint | 30 | 520.4 / 679.9 |
| navigationToAllDataPaint | 30 | 590.5 / 717.2 |
| modalShellMs | 30 | 18.3 / 24.4 |
| modalAuthoritativePaintMs | 30 | 411.5 / 468.2 |
| unloadedTabPaintMs | 30 | 122.7 / 144.3 |
| attendanceTabPaintMs | 30 | 37.0 / 45.6 |
| cachedTabPaintMs | 30 | 19.7 / 57.8 |

First observed navigation (excluded; no cold-cache claim): summary 550.5 ms; all data 552.0 ms.

| Local RPC (callback-entry RTT) | Samples | RTT p50 / p95 ms | Server VM p50 / p95 ms | Callback p50 / p95 ms |
|---|---:|---:|---:|---:|
| getDashboardData | 30 | 22.6 / 40.9 | 2.6 / 3.9 | 2.3 / 3.5 |
| getTamuList | 30 | 41.5 / 66.4 | 0.7 / 1.1 | 14.8 / 20.5 |
| getRapatCalendar | 30 | 112.0 / 132.9 | 14.3 / 17.9 | 15.9 / 19.2 |
| getVisitWorkflow (mixed current/0/3) | 90 | 56.8 / 353.7 | 0.2 / 2.1 | 0.0 / 0.2 |

Mixed workflow RTT is diagnostic only; use separate tab intervals above for interaction comparisons. These RPC spans exclude callback work but can include scheduling while other requests/renderers run. The loopback Node server executes synchronous requests serially; production concurrency is not modeled.

| Synchronous browser renderer | Samples | p50 / p95 ms |
|---|---:|---:|
| renderMonthlyReport | 60 | 0.5 / 1.0 |
| renderTodayMeetings | 30 | 1.0 / 1.4 |
| renderRecentTamu | 30 | 0.9 / 1.4 |
| renderTamuTable | 60 | 14.0 / 19.4 |
| renderMeetingsList | 30 | 14.6 / 18.2 |
| renderVisitWorkflow | 120 | 0.6 / 1.0 |

Whole-scenario long-task count p50 / p95: 4.0 / 5.0; accumulated long-task time p50 / p95: 497.0 / 565.0 ms. All 30 scenarios used six read RPCs; cached-tab return used zero additional requests.


The browser records long tasks over the **whole scenario**, including stylesheet processing, rendering and workflows. Their aggregate cannot be assigned to Tailwind, layout or one function without a browser Performance trace. External Resource Timing entries for CDN, fonts and logo reported zero duration/transfer size in this environment. **Those zeros are unavailable attribution, not instantaneous downloads or proof of cache hits.** No reliable per-asset waterfall, layout/paint decomposition, browser memory peak or mobile-device latency is claimed.

The Node frontend probe executes the real `renderTamuTable`, `renderMeetingsList` and `filterAgendaRecords_` with DOM stubs. It confirms all **20 / 200 / 1,000** guest rows are rendered, with no paging. It also confirms an empty search serializes nested objects once per row. Those durations are HTML generation only; use the real-browser spans for DOM costs. In the representative large cohort, meeting rendering includes repeated local lookup work for linked visits (`canAdminRecordAttendance`); this deserves profiling alongside template generation, not attribution solely to Google Sheets. Overdue labels use the real wall clock: these runs occurred after all fixture meetings on 7 November 2026. Reproducing before/after fixture meeting times can change frontend status branches and HTML byte counts; this does not change backend payload/count reproducibility.

| Profile | N / rendered guest rows | Guest HTML bytes | Agenda HTML bytes | Guest generation p50 / p95 ms | Agenda generation p50 / p95 ms |
|---|---:|---:|---:|---:|---:|
| dense | 20 / 20 | 32710 | 45792 | 0.5 / 0.9 | 0.4 / 0.7 |
| dense | 200 / 200 | 328050 | 458474 | 3.9 / 5.4 | 3.6 / 5.0 |
| dense | 1000 / 1000 | 1642450 | 2293676 | 19.8 / 26.3 | 18.3 / 22.4 |
| representative | 20 / 20 | 32310 | 46707 | 0.4 / 0.6 | 0.5 / 0.7 |
| representative | 200 / 200 | 323643 | 467976 | 4.9 / 7.4 | 12.4 / 14.7 |
| representative | 1000 / 1000 | 1620191 | 2341559 | 28.6 / 36.9 | 237.8 / 244.2 |


## 6. Confirmed bottlenecks versus hypotheses

| Evidence | Classification | Relevant source / functions |
|---|---|---|
| Calendar document predicates: dense 630 / 60,300 / 1,501,500; representative 266 / 24,656 / 612,723 comparisons | Confirmed superlinear JS work. Timed VM scaling supports prioritizing it; production share unknown. | `Admin/Code.js::getRapatCalendar`, repeated `docs.some/find` |
| Three startup responses overlap reads and return complete lists | Confirmed duplicated work and growing bytes; transport impact unmeasured on GAS. | `Admin/Index.html::loadAllDashboard`; `Code.js::getDashboardData/getTamuList/readMeetingRows_` |
| Full attendance scan on tab 3 and archive retrieval | Confirmed amplification, not a measured Sheets bottleneck. | `VisitWorkflowStorage.js::getVisitWorkflow/readVisitWorkflow_`; `VisitArchive.js::getVisitArchiveDocument`; `AgendaDocuments.js::getAgendaNotula_` |
| Full table/agenda HTML, hidden views rendered; empty-search JSON; linked-visit searches | Confirmed frontend work. DOM assignment measured for medium desktop only. | `Index.html::renderTamuTable/renderMeetingsList/canAdminRecordAttendance`; `AgendaSearch.html::filterAgendaRecords_` |
| Long tasks and readiness gaps larger than named synchronous render spans | Confirmed browser symptom in local scenario; exact cause requires trace, not arithmetic subtraction of overlapping spans. | Browser startup, runtime CSS and render pipeline |
| GAS queue/cold starts, cross-project library load, Sheets service latency | Unmeasured external hypotheses. No cloud requests made for S02. | Admin/Public RPC entry points; pinned `SiTariCore` |
| Real document preview/conversion/base64 and browser PDF merge | Unmeasured realistic-file hypotheses; fake-file operation count only. | `VisitArchive.js`, `ArchiveClient.html`, Drive preview iframe |
| Initialization guards doing work on normal page loads | Conditional risk only. Guard state was not executed/read against production. | `Admin/Code.js::doGet` and configuration/import/sharing guards |

## 7. Recommended S03 order (not implemented)

| Priority | Next change / evidence gate | Benefit to measure | Effort / risk / reversibility |
|---|---|---|---|
| 0 | Collect sanitized staging spans and a browser Performance trace using section 8 | Attribute actual user delay before choosing broad changes | Medium effort; low risk with isolated data; instrumentation removable |
| 1 | Index document rows once in `getRapatCalendar`, preserving first-match semantics | Remove demonstrated quadratic comparisons; compare handler p50/p95 and identical output at all sizes | Low effort/risk; easy revert; no UI change |
| 2 | Narrow/deduplicate startup reads and response fields; reuse data safely | Reduce 11-read baseline and bytes while preserving fast summary and parallel readiness | Medium effort/risk; preserve display-time fallback, revisions and auth; independently reversible |
| 3 | Reuse frontend lookups, avoid empty-query serialization and unnecessary hidden-view rendering | Reduce HTML work/long tasks and improve list navigation without changing visual design | Medium effort/risk; require desktop/mobile parity and search/sort equivalence |
| 4 | Target attendance and reuse archive metadata within one authorized request | Reduce 5N scans/repeated reads without stale attendance or cross-visit file exposure | Medium effort/high correctness sensitivity; no long-lived stale attendance cache |
| 5 | Evaluate bounded server paging, request deduplication and revision-aware caching | Bound startup/list cost at larger workloads | Medium/high effort; global search/sort/report completeness and invalidation need design review. Visible pagination needs separate client approval. |
| 6 | Change asset delivery or library structure only after attribution | Reduce measured critical resources or cross-project overhead if demonstrated | Medium/high compatibility risk; preserve Public security boundary and pinned release controls |

Do not redo initial TextFinder targeting, parallel startup, lazy tabs, modal shell, or room-request deduplication. Do not add broad caching without explicit write/version invalidation. No Firebase proof of concept is justified by S02 alone: it would not directly remove JS joins, hidden-view HTML, document processing or browser long tasks. Reassess hosting/database alternatives only after equivalent end-to-end staging measurements and low-risk GAS changes are separately reviewed.

## 8. Safe procedure for missing Google-service evidence

No authorized isolated GAS staging deployment was supplied for this phase, and production `doGet` can initialize state. Therefore real Sheets time, Apps Script execution, library overhead, Drive latency, live RPC transport and cold-start distributions remain **missing**, not zero.

For a separately approved staging session:

1. Use isolated synthetic Sheets/Drive fixtures, sanitized configuration and a read-only account/setup. Confirm initialization/migration/sharing hooks have already been disabled for the test entry, rather than probing an unknown live URL. Do not deploy or alter production to collect the baseline.
2. Add removable test-only wrappers around read entry points and explicit service boundaries: open spreadsheet; values/display reads; TextFinder find/read; JS filter/map/join; document getFile/getBlob/conversion; serialization. Return numeric spans and table/endpoint labels only, no rows, URLs, IDs, emails, contacts or property values. Use a generated non-record correlation counter to pair nested spans.
3. Measure Admin direct calls and Public wrapper/library paths separately with identical fixtures and release versions. Capture warm and first-observed calls separately; a first call is not proof of a cold GAS worker. Run at least 30 valid calls per cohort/endpoint, interleaving candidate/baseline later to limit time-order bias. Record failures and distributions rather than dropping slow successes.
4. In VS Code browser or an authorized physical phone, record navigation start, callback/DOM-ready markers, modal handler entry/shell/authoritative data, each tab, paint opportunities and long tasks. Take a Performance trace to identify script/style/layout/paint and resource critical paths. Network readouts supply whole RPC round trips, not just Sheets latency. Repeated unopened/current/cached tabs must be distinguished.
5. Pair browser RTT with server spans. The residual contains platform scheduling, transport, serialization and browser queue/parse work: do not label it pure network or subtract unrelated p50s. Classify service spans and nested library time without double counting.
6. Use only synthetic PDF/images in the staging folder for realistic 0.1/1/5 MB retrieval/conversion/merge cases; do not change sharing, upload real documents, send WA or approve workflows. Keep raw traces/HAR outside Git and redact before any aggregation. Remove test-only instrumentation after collection.

For local reproduction, commands and precise boundaries are in [the harness README](../../local-test/performance/s02/README.md) (repository-relative path: `local-test/performance/s02/README.md`). Run `node local-test/performance/s02/run.cjs`, then the isolated browser server and visible runner; do not repoint either to GAS. Timing numbers vary with device/load; counters, output equality and payload bytes are the reproducible correctness checks.

## 9. Regression risks, acceptance criteria and validation

Future optimizations must preserve:

- Exact source output fields, first-document precedence, cancellation/manual-attendance states, linked TLD/TDD/internal classification and all Drive references.
- 24-hour WIB/date parsing including Sheets Date and display values; room conflict rules, retrospective attendance, roster scoping and manual-attendance locking.
- Workflow versions, authorization, stale-response cancellation, cached read-only preview, tab merge/invalidation and fresh arrival data.
- Public wrapper allowlist and two-project ownership; no privileged Admin data in Public master/calendar payloads.
- Search OR/comma/date semantics, global sort order, monthly-report completeness and current approved desktop/mobile layouts.

Acceptance before claiming an improvement: run the same fixture/runtime/profile and read-only browser scenario, compare p50/p95 with identical outputs or explicitly reviewed payload contracts, report failures and service counts, and confirm no slower small/medium interaction is hidden by a large-cohort average. For a document index, require linear lookup work at all sizes and duplicate/missing/invalid-document tests. For startup batching/caching, require fewer reads/bytes plus out-of-order save/refresh tests. For attendance/archive changes, require per-agenda isolation, fresh writes and version checks. Absolute cloud targets need an approved real staging baseline first.

S02 validation: **48 tests passed, zero failed** across the nine new harness checks and existing performance, lazy workflow, GAS workflow, agenda attendance, meeting-time storage and mobile-readability tests. Existing tests use authorized private local configuration where required; the new S02 harness does not depend on those excluded files and needs no packages. Two complete synthetic runs reproduced all 42 operation/payload records. The final visible browser runner completed 30 valid samples with no browser errors and verified zero extra RPC on cached-tab return. SHA-256 checks confirmed **54 application files** unchanged, including private local configuration, and Git shows no application-source modifications. Private configuration exclusions remain intact.

This is a measurement delivery for review. It does not optimize, deploy, merge to main, migrate data or change the client-approved UI.
