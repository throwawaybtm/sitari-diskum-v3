# SITARI DISKUM v3 — S03A calendar document indexing

Date: 7 November 2026 (Asia/Jakarta). Branch: `perf/s03a-calendar-index`. Base: `bd04db7a63ebb531b042c42731c27b8dd6a1b434` (`perf/s02-measurement`).

## Outcome and boundaries

`Admin/Code.js::getRapatCalendar` now builds a request-local first-row document index and retrieves the matching row once per active meeting. This removes the demonstrated repeated document-array scans. The complete response matches the original S02 function across all six standard cohorts and adversarial regression fixtures. **No production or end-to-end performance improvement is established by these synthetic measurements.**

The [S01 audit](SITARI_PERFORMANCE_AUDIT.md) and [S02 baseline](SITARI_S02_PERFORMANCE_BASELINE.md) were reviewed before changes. The clean starting branch/HEAD matched the approved S02 commit, and this dedicated branch was created directly from it. No UI, public signature, business rule, authentication, workflow permission, persistent cache, project manifest or Admin/Public library pin was changed. No Apps Script deployment, production page/RPC execution, live data access, Drive mutation or notification occurred. `main` is not merged.

## Implementation and behavior preservation

The original calendar path invoked `docs.some()` for status and `docs.find()` up to twice for document parsing per active meeting. A `Map` now stores the first raw document row under `String(row[0])`. Subsequent duplicate keys are ignored. For each meeting, one lookup supplies both status and document data.

- Identifiers retain exact `String` equivalence: `1` and `'1'` match; `'01'` and `' 1 '` remain distinct. There is no trimming, numeric parsing, rejection or normalization of malformed IDs. Map keys also safely preserve strings such as `__proto__` and `constructor`.
- The first matching row wins even when its document field is empty or malformed. An existing row still marks the meeting `Selesai`; an empty document value still returns `notula: null`. A missing row retains the stored status.
- JSON is parsed only at the matched, non-cancelled meeting. Invalid JSON in unmatched rows, cancelled meetings or later duplicates stays ignored; invalid JSON in the selected first row still throws `SyntaxError`. No eager parsing or error suppression was added.
- Meeting ordering, response key order and fields, photo arrays, manual attendance flags, cancellation filtering, room/date/time conversion and linked visit codes retain the original behavior. Each response still parses a fresh document value per meeting.
- The Map exists only during one request and stores references to raw rows. Every invocation rereads document metadata. There is no cross-request stale state or new service call.

Only `Admin/Code.js` changes application behavior internally; its diff is confined to `getRapatCalendar`. `Public/`, `Tamu-Luar/`, `Tamu-FO/`, all UI files and configuration remain unchanged.

## Measurement method

Environment: Windows `10.0.26200`, x64, Node **24.22.0**, AMD Ryzen 7 4800H, 16 logical CPUs. No controlled CPU load/throttling, GAS runtime, real Sheets delay or browser timing is modeled.

The new comparison runner reuses S02 `createEnvironment().measure()` and nearest-rank statistics unchanged. The **before** VM executes the exact original calendar function loaded with `git show` from the fixed S02 commit; the **after** VM executes the current tracked function. All other tracked backend code and synthetic service mocks are the same. Source extraction fails if the expected function boundaries are missing. A fresh clone needs the S02 commit object available; no credentials or private staff configuration are needed for these probes.

Fixtures and sizes are unchanged from S02: 20/200/1,000 visits and agendas, 5N attendance rows, 70 synthetic employees. Dense has N notula and photo rows; representative has notula every third agenda and photos every fourth, mixed dates/statuses and linked/internal agendas. These are designed synthetic workloads, not production distributions.

For each cohort: a separate counted before/after pass, five warmups, then **30 timed samples per version**, alternating before/after execution order within each pair. Every timed result is checked for exact serialized-response equality with the original. Structural passes check identical range reads, response bytes and expected bounded Map work. Instrumented Map operations and legacy document predicates are counted only outside timing samples. Timing includes backend processing plus in-memory service work; JSON serialization is recorded separately. Counts exclude service metadata methods, as in S02.

Two complete paired runs were collected. The first overlapped the local suite briefly and is not used for the headline timing table. The second was run after the suite completed. Counts and payload sizes agreed between runs; no percent reduction, confidence interval or cloud-speed claim is inferred. Raw diagnostics remain ignored under `outputs/performance-s03a/`.

## Before/after results

All timings are local warm-VM milliseconds, p50 / p95, 30 samples per version/cohort. Response bytes are full JSON UTF-8 before compression.

| Profile | N | Before handler ms | After handler ms | Before scan callbacks | After has / set / get | JSON bytes (both) |
|---|---:|---:|---:|---:|---:|---:|
| dense | 20 | 0.634 / 0.810 | 0.410 / 0.595 | 630 | 20 / 20 / 20 | 12016 |
| dense | 200 | 26.640 / 27.600 | 3.761 / 4.190 | 60300 | 200 / 200 / 200 | 120497 |
| dense | 1000 | 595.148 / 611.368 | 18.739 / 21.141 | 1501500 | 1000 / 1000 / 1000 | 603698 |
| representative | 20 | 0.451 / 0.708 | 0.354 / 0.502 | 266 | 7 / 7 / 20 | 9553 |
| representative | 200 | 12.680 / 13.187 | 3.420 / 3.738 | 24656 | 67 / 67 / 200 | 95689 |
| representative | 1000 | 250.894 / 266.057 | 17.292 / 20.292 | 612723 | 334 / 334 / 1000 | 479787 |

Candidate scan callbacks: zero in every cohort. Each candidate creates exactly one request-local Map. Every compared serialized response is identical.

| Profile | N | Before / after residual p50 ms | Before / after mock reads p50 ms | Before / after stringify p50 ms | Rows / cells (both) |
|---|---:|---:|---:|---:|---:|
| dense | 20 | 0.438 / 0.210 | 0.196 / 0.196 | 0.023 / 0.022 | 180 / 1880 |
| dense | 200 | 24.598 / 1.844 | 1.928 / 1.914 | 0.258 / 0.214 | 1800 / 18800 |
| dense | 1000 | 585.135 / 9.003 | 9.692 / 9.705 | 1.660 / 1.583 | 9000 / 94000 |
| representative | 20 | 0.275 / 0.177 | 0.178 / 0.178 | 0.019 / 0.018 | 152 / 1796 |
| representative | 200 | 10.905 / 1.665 | 1.760 / 1.760 | 0.194 / 0.174 | 1517 / 17951 |
| representative | 1000 | 241.770 / 8.375 | 8.831 / 8.917 | 1.071 / 0.998 | 7584 / 89752 |

Candidate `Admin/Code.js` SHA-256: `7e32bc30bd7d78d2ee27b437f535d9d8ab7a4e32c206e97a89e013f4648a4ed4`. The measured source is unchanged after this run.


Legacy predicate callback counts and Map API operation counts are different measures: **zero predicate callbacks does not mean zero matching work**. The candidate builds the index with D `has` calls and U `set` calls for D document rows/U distinct string keys, then makes A `get` calls for A active meetings. Thus the number of matching operations is bounded by D + U + A; memory grows with U. Standard fixtures have no duplicate IDs, so U = D. These counts establish the work reduction, not a production latency percentage or a measured worst-case hash-table cost.

Each standard calendar call still opens one spreadsheet, makes five range value/display reads, and fetches zero Drive files. Rows, cells and bytes are identical before/after. All three Admin startup calls still total 11 range reads: this change does not optimize Sheets reads, attendance-table scope, document payloads, RPC transport, browser rendering or external resources.

Handler duration, mock-read duration and residual processing use the S02 boundaries. Residual means handler minus in-memory range/finder spans, including remaining mock and observer overhead; it is not pure application CPU. Medians of separate spans need not add to the median handler. No browser or GAS before/after capture was attempted, because this phase prohibits deployment and no isolated live environment was supplied.

## Regression and full-suite validation

Tests were written before implementation. The new work-bound test failed on the original with **630 predicate callbacks instead of zero**, while behavior tests already passed. After the index change, the behavior and work-bound tests passed.

Seven new regression tests cover:

1. Missing document sheets and empty tables, original statuses, photos, manual attendance, cancellation and meeting order.
2. Duplicate numeric/string IDs, first-row precedence, and empty first documents.
3. Exact string identifier semantics, including leading zeros, whitespace, booleans, blanks, non-finite/malformed IDs and prototype-like names.
4. Raw null/undefined/non-finite coercion using an additional adapter that bypasses S02 blank-cell normalization, compared against the original function.
5. Lazy malformed JSON and identical selected-first-row failure behavior.
6. Changed/removed documents reflected on the next request, without persistent caching.
7. Exact full-response equality, byte equality, service-read equality and bounded matching at every dense/representative size.

The S02 current-source harness expectation was updated from 630 scan callbacks to zero. The 630 original-source assertion remains in the S03A oracle test, so the historical baseline is still checked. S02 fixtures, timers, counters and published report were not rewritten.

A fresh independent review found no blocking issues and independently passed all 16 S02/S03A tests. File-hash verification confirmed that the candidate matches the benchmarked source hash and that 53 other application/configuration files remain unchanged from S02.

**Complete available local suite: 203 passed, zero failed, zero skipped.** This includes the authorized local private configuration/test originals, existing calendar, meeting-time/conflict, photo, Public build/delegation, attendance, authorization, lazy workflow, stale-response, archive, desktop/mobile markup and local HTTP tests, plus S02 and S03A probes. Tests use mocks/in-memory servers; their simulated writes do not access Google services. The source exclusion rules remain intact and private files are not part of this commit.

Reproduce from the repository root:

```powershell
node --test local-test/test/*.test.js local-test/performance/s02/harness.test.cjs local-test/performance/s03a/calendar.test.cjs
node local-test/performance/s03a/run.cjs
```

The full existing suite requires the authorized private local files described in [repository baseline documentation](../REPOSITORY_BASELINE.md). The new benchmark and regression file do not require them. Results are written only to ignored `outputs/performance-s03a/comparison.json`. Keep traces, logs and private records out of Git.

## Remaining risks and next recommendation

The index adds O(U) request-local memory and scans all document IDs once, including unmatched/cancelled metadata. With very few active meetings and a huge unrelated document table, that fixed build cost may not be beneficial; no claim is made for every workload. It assumes ordinary Sheets cell values with stable `String` conversion. Exotic JavaScript objects with side-effectful/throwing coercion are outside the Sheets data contract. Invalid selected document JSON still fails the endpoint, deliberately preserving existing behavior.

GAS V8 timing, cold starts, Google RPC overhead, Sheets/Drive service latency, realistic production data distributions and phone responsiveness remain unmeasured. The unchanged Public library pin means this local source change does not alter the already-published Public backend. Releasing it later requires a separate reviewed deployment/library decision; nothing here updates that relationship automatically.

Next, collect the sanitized isolated-staging attribution described in S02 before claiming user-visible improvement. The next code candidate is reducing duplicated startup reads/payloads while retaining the parallel summary path, exact date/time fallbacks, complete search/report data, revision guards and authorization boundaries. Do not silently truncate lists, introduce visible pagination, add stale workflow caches, or begin Firebase migration on the strength of this benchmark.

Delivery scope: source change, regression/measurement helpers, one S02 test-budget update and this report. Push the dedicated branch for review only; do not merge or deploy.
