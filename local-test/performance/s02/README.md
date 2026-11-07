# S02 measurement harness

Run from the repository root with Node 24. No package installation, credentials, private configuration, Google connection, or GAS deployment is needed.

```powershell
node --test local-test/performance/s02/harness.test.cjs local-test/test/performance.test.js
node local-test/performance/s02/run.cjs
node local-test/performance/s02/browser-server.cjs
```

The CLI writes numeric diagnostics and source hashes under ignored `outputs/performance-s02/`. Preserve a copy before rerunning if comparing sessions. Counts and fixture payload sizes should match; milliseconds will vary. The VM uses the real tracked Admin read functions, not a reimplementation. `frontend.cjs` extracts the real HTML generators with explicit source-boundary checks; its DOM stubs do not measure browser layout or paint.

For browser measurements open **http://127.0.0.1:4174/** in VS Code's integrated browser, keep the tab visible, and click Run. The visible iframe contains the unchanged Admin markup, scripts and styles with synthetic data. Test-only template substitution supplies the tracked room directory, disables outbound app links, redirects the synthetic document preview locally, and appends removable instrumentation. The original `doGet` is never executed. Only four read RPCs are served. All other RPCs are denied; unknown Google service methods throw. CSP restricts connections and frames to localhost, blocks forms, and permits the app's public static CDN/font/logo resources. QR-service images are deliberately blocked. Do not interact with save/upload/notification controls during measurement; they have no supported server endpoint.

The runner excludes the first observed navigation and five warmups, then stores 30 valid samples in server memory at `/results`. It checks successful authoritative data, cached-tab request reuse, browser error count and visibility. The first navigation is **not** a cold-cache measurement. Stop the server with Ctrl+C after saving diagnostics. It binds only to loopback and exposes no filesystem browsing.

Save the numeric browser diagnostics locally (not to Git):

```powershell
node -e "fetch('http://127.0.0.1:4174/results').then(r=>r.json()).then(x=>require('fs').writeFileSync('outputs/performance-s02/browser.json',JSON.stringify(x.at(-1),null,2)))"
```

Metrics use milliseconds and nearest-rank percentiles. Local RPC duration includes localhost transport, Node scheduling, JSON serialization/parsing and browser scheduling. Callback and named renderer spans measure synchronous JavaScript/DOM work. Two animation frames are a paint-opportunity approximation, not proof of pixels presented or full interactivity. Modal intervals start at programmatic handler invocation; physical input dispatch/queue delay is excluded. Workflow callback spans resolve a promise; use `renderVisitWorkflow` spans for the later DOM work. Nested spans must not be summed. Long tasks cover the whole scenario, not only dashboard startup.

`mockServiceMs` times in-memory range copies and TextFinder scans only. `jsResidualMs` subtracts those spans from VM handler time; it still includes mock property/metadata methods and measurement overhead. Neither is a Google-service duration. Serialization is timed separately. Heap deltas can be negative because GC is uncontrolled; RSS is process-wide, not peak request memory. Join counters run separately from timed samples, with output equality asserted. Fixed cohort/endpoint order, reused VM, 5 warmups and 30 repetitions are deliberate; compare on the same runtime/device and idle machine before interpreting changes.

Fixtures contain N visits, N agendas, 5N attendance rows and 70 invented employees. The dense profile has every agenda today, with a notula and photo per agenda; the representative profile mixes dates, six visitor statuses and linked/internal agendas, with a notula every third agenda and a photo every fourth. These are workload scenarios, not sampled production proportions. Archive probes return a four-byte fake PDF prefix: they count access but do not benchmark PDF validity, realistic document sizes, conversion or merging. Sheet values are strings, so actual Date objects and display-value fallbacks remain covered by existing meeting-time tests rather than this benchmark.

Frontend overdue labels use the real wall clock against fixed fixture dates. HTML byte counts and status branches can vary if reproduced before/after those meeting times; record the run date. The published baseline was collected after all fixture meetings on 7 November 2026. Endpoint operation counts and payload sizes do not use these frontend overdue labels.

Do not aim this server or runner at production. Real Apps Script, Sheets, Drive and library timing requires the separate safe staging procedure in the S02 report. Keep HAR, browser traces and any private diagnostics outside Git.
