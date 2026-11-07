# SITARI DISKUM v3 - S03D.1 staging assembly and safety completion

Date: 8 November 2026, Asia/Jakarta. Branch: perf/s03d1-assembly. Approved preparation base: 80722660befe259a7b07463ba2b230e9ff83c7dd. Application input is pinned to S03C d1d02475acba50439835c8fcc5b163828897e9ea.

## 1. Delivery and readiness

This milestone supplies an executable, locally tested two-project staging assembly generator, private generated Admin/Public projects, a loopback synthetic-service host and read/UI security checks. It fixes stopped browser instrumentation so queued frames, pending RPCs, observer deliveries and error handlers cannot append telemetry afterward. Original app source and production configuration are unchanged.

**Local executable readiness is not verified cloud isolation or permission to deploy.** No Google resource was accessed, created, changed or deployed. No real cloud/device performance measurement occurred. A fresh independent safety review is required before any deployment-readiness claim; actual account/ACL ownership, consent, GAS hosting/library behavior and operator approval remain gates even after a local review passes.

The complete S03D report and its tests were reviewed before implementation. The initial branch/commit and clean tree were verified. Work remains in the current checkout on the requested dedicated branch; no separate worktree or production checkout was changed.

## 2. Assembly inventory and source provenance

assemble.cjs loads the immutable Git object, never the working private configuration. The eight pinned backend modules are evaluated in an isolated Node VM solely to extract an explicit allowlist of 42 original function definitions; none are invoked by the builder. Read/pure function bodies are preserved and SHA-256 recorded individually. Missing functions or unexpected mutation calls fail assembly. The builder never loads EmployeeDirectory, VisitPicContacts, DeploymentConfig, PublicIntake, Setup, migration modules or credentials. Existing local clasp project IDs are read only for the production denylist; no clasp configuration is copied, invoked or deployed.

Generated output is restricted to ignored outputs/performance-s03d1/assembly:

- Admin: Code.js with private read factory, 14 reviewed read exports plus doGet; 13 original HTML files, invisible StageGuard.html and readonly manifest.
- Public: Code.js with three bounded read wrappers plus doGet; six original HTML files, invisible StageGuard.html and pinned-future-library readonly manifest. It contains no copied Admin read core.
- Private inventory records every input/function/tool/artifact hash and export list; config.private.json contains only the validated staging declaration. No .clasp.json or deployer is created. No generated executable/configuration files are staged in Git.

There are 25 generated project files plus the two private inventory/configuration files. Running the generator with the local-synthetic configuration produces dummy non-cloud project IDs and loopback URLs; that output cannot be used as a live deployment without new configuration and approval.

The generator accepts only its exact configuration schema, rejects unknown keys/credentials, mixed/duplicate project resources, known production IDs/URLs, mismatched library ID, floating version, blank approver and non-approved URL shapes. Local mode has fixed loopback targets. A future private configuration file must be under ignored outputs/performance-s03d1; generated files always remain there. Opaque IDs cannot establish ownership: a syntactically valid unknown ID is **not independently proven staging**. The dedicated-account/ACL gate still applies. CLI errors do not echo private input.

Pinned input file SHA-256 values:

| File | SHA-256 |
|---|---|
| Admin/Code.js | 8a615af86d48fbd858c8ad9520e913f37200e8ea8930081630fc4966abd83794 |
| Admin/MeetingRooms.js | c68efa6d711f9e44b38b3fae15b0e53dde33653fe2bd454a819a7a4a78b08db4 |
| Admin/VisitWorkflow.js | 1e111981ba2ef7e7b9e6eb9a815b455d6d49204c3fcf6d6151bd53bdf19f8a6f |
| Admin/VisitWorkflowStorage.js | 420e3922a18c42b5fefd890f31a3bd3306aba68babc10e57cf3a66d497df23e6 |
| Admin/AgendaDocuments.js | cdece03394ee802cc5c03ea9781241bb1d53b55e94f5c2177476d50e81facd17 |
| Admin/AgendaAttendanceData.js | 69d002c43c46108bdfe08fc3e89de28ebcbd48fa2d25a7ab2e811b65027a4890 |
| Admin/VisitArchive.js | b21b4464c64a45b93260b4f64e3f92c848400d33349a9df070c086c45cfa6f4b |
| Admin/PublicApi.js | 616440346924630293897a7b2b20ec0458c5ffef1d8eab549bb97344ca258a87 |
| Admin/AgendaAttendance.html | d55bf3b594861e1c52235c6aa65a0bd665bbb2db6b1f5deac6672b1007dff2bd |
| Admin/AgendaSearch.html | 5b3326c0e4ed91bb2846c89e3bd63d939ebd07bcdc99e4f5ab11e60807704569 |
| Admin/ArchiveClient.html | 36cbf3ead60a88206c61a8eaa82dc59ac800b0bd3c0f30ac2ab8824f91badfe6 |
| Admin/AttendancePolicy.html | 8adae8471c3b4f351bada14e2085f037722f304faa52486c294c307c76235830 |
| Admin/BookingCalendar.html | db88d88f317a93ba73b565a5129b84dc6f357c652b9bbe1a2cd4c765118ea5d4 |
| Admin/Index.html | b90b6ea3d15f7adfbc133c464527ff41b4034a2bc2b5f5d6160c6f157a5d77ba |
| Admin/MeetingPhotos.html | 88355ab5a0633c250cb621dde90b722153bec23ac1a9ebec649e77b14bba14cd |
| Admin/MobileBase.html | cb2c9b4ffbf3156feeb5c846266c6faaa16d1c8879705f798f3800e0d7c5ca2a |
| Admin/Presensi.html | 94d71d18587fa9e9a63b9824c880d5993b6362e930bb295951186a2968e88ff8 |
| Admin/Stylesheet.html | 36eaf0df1d65546bd5fb677420e68accae0c35ded081fa388ff4580f8af2585b |
| Admin/Tools.html | c943dd2f3da4a7d33b1c63ed0fb3e0c996228acf4ef96e0329ebe7ddd4925098 |
| Admin/VisitAttendance.html | caaf066518761203ac30c36b507af16466bdf6da8b4e33952e1b15952360188a |
| Admin/VisitModal.html | 1590bb5c2cde1316cf9abb478ee39bd82391b54db8811d2eb9b95146baf1c235 |
| Public/AttendancePolicy.html | 8adae8471c3b4f351bada14e2085f037722f304faa52486c294c307c76235830 |
| Public/MobileBase.html | cb2c9b4ffbf3156feeb5c846266c6faaa16d1c8879705f798f3800e0d7c5ca2a |
| Public/OrganizationStructure.html | 3a6b72d8a83ab8a0b39188892617a94316bd39954c9515421da8d37f4a005977 |
| Public/Presensi.html | 0b22096ae7ee242f199dc8c66b88ea42fa85a0ca4a394516e7e34ab40cc053d7 |
| Public/Tdd.html | 4977526f79e6ce15ad7962908e2a1f487f06a1b1ffbf61629b29d350338d27d7 |
| Public/Tld.html | 1febfb6d26b0cfadfc1af078127520e7448716057ac9f0486a4f91508aefdc4c |

Representative generated local artifact SHA-256 values (these change when the private staging declaration changes):

| File | SHA-256 |
|---|---|
| Admin/Code.js | 94d09730a89c6d63e622c1790c489f17b55b038fd53f3fb0c494070e07518709 |
| Public/Code.js | e8e7a5183dc246981aa6e92d9461d7fe2e8b21058238baa891a54d9c5a658739 |
| Admin/Index.html | b90b6ea3d15f7adfbc133c464527ff41b4034a2bc2b5f5d6160c6f157a5d77ba |
| Admin/Presensi.html | 94d71d18587fa9e9a63b9824c880d5993b6362e930bb295951186a2968e88ff8 |
| Public/Tld.html | 1febfb6d26b0cfadfc1af078127520e7448716057ac9f0486a4f91508aefdc4c |
| Public/Tdd.html | 4977526f79e6ce15ad7962908e2a1f487f06a1b1ffbf61629b29d350338d27d7 |
| Public/Presensi.html | 0b22096ae7ee242f199dc8c66b88ea42fa85a0ca4a394516e7e34ab40cc053d7 |

## 3. Executable safety boundaries

Original read functions live inside makeCore_, not at global RPC scope. Their only service bindings are the readonly capability objects, narrow format/base64 utilities, Session active-user email and a readonly property map. No raw spreadsheet/Drive handle, CacheService, PropertiesService, UrlFetchApp, LockService, setup/migration helper or authorization bypass is returned from the core. Internal references resolve to these lexical bindings, not raw GAS service globals. No eval or user-supplied code runs in the generated app.

Staging substitutions are explicit, not performance optimizations:

- getSpreadsheet opens only the configured exact database and requires all ten pre-provisioned tables. It never discovers, creates, copies, formats or repairs a resource.
- visitWorkflowSheet_ rejects create=true; a missing workflow table fails closed.
- cachedMasterRead_ invokes the read directly. Cache is deliberately disabled: no cache write or misleading production-equivalent warm-cache claim. The strict table check adds metadata overhead; later measurements must label that staging overhead separately.
- requireVisitAdmin_ is the exact pinned original function. Its readonly property map forces ADMIN_DEMO_MODE=false and supplies only the staging approver. Session uses the actual caller in a future GAS environment; tests inject synthetic identities and prove a different identity is denied before privileged reads.
- The original five bounded Public-core APIs remain usable as intended: employee count, synthetic form destinations, public master/calendar projections and agenda-scoped roster. Public receives no visit-workflow/document/approval endpoint. Synthetic destinations/count data are generated locally, not copied from private contacts.
- Runtime project identity must match one of the two configured staging projects; a copy into a different project fails closed. Both allowed IDs remain subject to the operator's ownership verification.
- RPC payloads have per-method key allowlists, primitive-value constraints and size limits. No caller can supply a spreadsheet handle. The empty object produced by the local browser bridge is deliberately not forwarded into the optional internal spreadsheet argument of getTamuList.
- Read responses are checked recursively: outgoing HTTP URLs must be explicit configured synthetic Drive file view/preview URLs. Wrong metadata URLs fail before they can become browser links; blob reads have the independent file-ID allowlist and accept only PDF/PNG/JPEG. Native-document conversion and unsupported MIME paths are denied, never silently converted or written.
- Scalar/array API results retain their shape; object responses add removable numeric _s03d metrics. Diagnostics contain fixed labels, durations/counts only, never arguments, record values, emails, IDs, file URLs, errors containing sensitive text or document bytes. Actual synthetic response data is for the UI only, separate from diagnostics.

Approved global exports:

- Admin: doGet; getDashboardSummary, getTamuList, getRapatCalendar, getMasterData, getMeetingRoomOptions, getVisitWorkflow, getVisitAttendanceRoster, getAgendaAttendance, getVisitArchiveDocument, getAgendaPhotoDocument, getPublicEmployeeCount, getPublicFormDestinations, getPublicAttendanceMasterData, getPublicAttendanceCalendar.
- Public: doGet; getMasterData -> staging SiTariCore.getPublicAttendanceMasterData; getRapatCalendar -> getPublicAttendanceCalendar; getVisitAttendanceRoster -> scoped roster.

All other generated helpers end in underscore or are closure-private. Tests enumerate actual generated VM functions and compare to this inventory. Save/upload/register/notify/reschedule/attendance/approval/migration/setup RPCs are absent, rather than merely disabled visually. Existing UI controls remain visually unchanged and receive a read-only failure if invoked; direct backend entry cannot bypass that restriction.

## 4. Page rendering, UI equality and browser network safety

The original 19 HTML templates/includes and all stylesheet text are copied byte-for-byte from the pin. The staging-only doGet chooses an explicit page allowlist, assigns safe staging URLs, synthetic directory/counts and the original room presentation directory, and evaluates the pinned template. It never calls the production entry or its guards. Template include helpers use an allowlist and are not exported RPCs.

After evaluation, only browser bridge references are routed through the allowlisted staging bridge, and one invisible script is inserted in head. It changes no visible HTML or CSS. Tests compare every evaluated page against the pinned template under the same synthetic variables, including every static element/style and the exact permitted bridge substitution. Original Admin/Public source remains untouched. Desktop/mobile media rules and responsive markup remain identical.

StageGuard blocks unknown/write RPC names before native bridge or local fetch dispatch; backend exports enforce the same restriction independently. It restricts fetch to same-origin approved read endpoints, rejects navigation to unapproved app/document URLs, prevents native form submission and checks document preview targets. Local document opening redirects allowed synthetic files to the loopback preview handler. Data/blob exports remain client-side only.

The loopback host sends restrictive CSP **as an HTTP header before parsing**, binds only 127.0.0.1, checks Host and exposes only the two page paths, approved reads, numeric test receipts and known synthetic previews. Local browser mode permits no outbound resources, including static CDNs, fonts, logos, QR service or Google Drive. Thus local browser appearance lacks external assets: **pixel-level visual equivalence was not measured**. Exact approved markup/stylesheet identity is verified; the offline run is a real-script functional/security check, not a styling or performance claim.

Future GAS output retains the pinned resource references and applies the injected CSP with explicit static vendor hosts and only configured Drive preview paths. The actual GAS host's CSP interaction, include evaluation, native script bridge, iframe viewer and immutable-library execution identity still need an authorized smoke test; local VM success cannot prove them. No broad production app URL or library fallback is emitted.

## 5. Telemetry teardown correction

The S03D browser probe now tracks an active state and every scheduled animation-frame ID. stop() is idempotent: it first marks inactive, restores the original bridge, cancels frames, clears the frame set, disconnects observers and removes the error listener. Every asynchronous path checks active before changing telemetry, including callbacks already queued before stop and callbacks that stop instrumentation themselves. Late RPC callbacks still deliver the caller's success/failure continuation, preserving app behavior; retained obsolete wrapper references dispatch no new request after stop. begin completion callbacks and synchronous span recording are inert after stop while the span's original work may still execute.

The regression test first failed with queued frames remaining after stop, then passed after the correction. It checks pending success/failure, manually delivered stale frames, delayed observers/errors, retained wrapper references, repeated stop and immutable snapshots after stop. This does not cancel the underlying GAS request or prevent the application from completing its read; it stops telemetry only.

## 6. Local validation and results

**234 tests passed, zero failed/skipped**: all 223 earlier regressions plus eleven S03D.1 tests. New checks cover generated/pinned source and export inventory, configuration rejection, exact evaluated page output, every approved read endpoint, all workflow tabs, Public projection, different-user denial, wrong project/resources/URLs, missing tables, payload injection, MIME restrictions, all dataset sizes and HTTP transport/write denial.

The VS Code integrated browser also completed the owned offline runner: **five pages, 27 read/UI checks, zero failures**. Pages: Admin dashboard, Admin attendance, Public TLD, Public TDD and Public attendance. The runner executes actual page initialization and handlers, navigates Admin tabs, opens all workflow tabs, attendance overview, photo viewer, manual-attendance read shell, photo document read, public master/roster reads, and confirms forbidden submissions fail. It never submits an approved mutation. Numeric per-page checks: 14 / 4 / 2 / 3 / 4. Failed development probes were used to fix the adapter's empty-argument issue with a failing regression test before rerunning; final evidence is the successful run, not fabricated latency.

The Node HTTP tests cover aliases and every page variant as well. Complete 20/200/1,000 cohorts remain present in visitor/calendar results and statistics. All generated configuration, fixtures and browser receipts are ignored/private. Neither cloud nor phone latency is reported. No Google APIs, deployment commands or resource provisioning were invoked. Loopback server was stopped after validation.

## 7. Exact proposed permissions and remaining prerequisites

Both generated manifest templates propose:

- Runtime V8; timezone Asia/Jakarta; exceptionLogging NONE.
- OAuth scopes: https://www.googleapis.com/auth/spreadsheets.readonly ; https://www.googleapis.com/auth/drive.readonly ; https://www.googleapis.com/auth/userinfo.email . No full Drive/Sheets write or external-request scope.
- Web app executeAs USER_ACCESSING, access MYSELF initially. Admin remains restricted by the real approver check too.
- Public SiTariCore: exact configured staging Admin project ID, a positive immutable version string and developmentMode=false. Local fake IDs/version 1 are placeholders; production library 37 and current production IDs are never reused.

Scopes are an additional limit, not proof that an account cannot read production. No property/cache write service exists in the measured core. The testing host has only in-memory synthetic services, not Google clients.

Before cloud use, the operator must privately verify:

- A dedicated test account has no production memberships, shared drives, inherited shares, credential delegation or production token stores.
- New Admin/Public projects, synthetic spreadsheet and synthetic file/folder inventory are owned by that account; effective ACLs are private and IDs absent from the complete production inventory.
- Real configuration is under ignored outputs only, contains no tokens/private employee/contact files and matches the reviewed source/artifact hashes. Opaque ID/URL syntax validation alone is insufficient.
- All ten tables, timezone, row schemas and synthetic-only documents are provisioned by a separately authorized process. No production clone, importer, sharing migration or initialization hook is used.
- Future Public library publication points to the new Admin immutable version, never an existing production library. Actual library current-project identity and signed-in user email behavior pass an approved smoke check; if they fail, stop instead of enabling demo mode/open access.
- Native bridge/CSP/template rendering and preview permissions work in GAS without broadening scopes. Desktop and physical-device appearance require approved static assets and later visual checks.
- An independent review passes the exact executable assembly; the user then explicitly approves specific new resources, scopes, access/execution mode, deployment/version operations and rollback. This milestone authorizes none of those cloud actions.

**Unresolved:** actual account/resource ownership, ACLs, consent and GAS host/runtime compatibility; future real staging configuration and publication; cloud/device measurements; explicit provisioning/deployment approval. Local assembly is runnable and testable now, but these remain mandatory before a real environment can be declared isolated or deployment-ready.

## 8. Reproduce and independent rollback

From the workspace root, Node 24, with the pinned Git object available:

```powershell
node local-test/performance/s03d1/assemble.cjs
node --test local-test/test/*.test.js local-test/performance/s02/harness.test.cjs local-test/performance/s03a/calendar.test.cjs local-test/performance/s03b/startup.test.cjs local-test/performance/s03c/*.test.cjs local-test/performance/s03d/*.test.cjs local-test/performance/s03d1/*.test.cjs
node local-test/performance/s03d1/local.cjs
# In VS Code integrated browser open http://127.0.0.1:4176/check and Run all five pages.
# Save only numeric receipts locally, then Ctrl+C the loopback server:
node -e "fetch('http://127.0.0.1:4176/results').then(r=>r.json()).then(x=>require('fs').writeFileSync('outputs/performance-s03d1/browser-checks.private.json',JSON.stringify(x)))"
```

A future private declaration can be supplied as an explicit generator argument only from outputs/performance-s03d1. The CLI has no clasp/GAS deploy or cloud request operation. Never run deployment commands from tracked Admin/Public directories.

Rollback now: stop the loopback server and remove the installed probe via stop if used; regenerate ignored output from the approved pin or keep it private. No production resource or setting needs restoration. After a future separately approved staging deployment, disable/archive only the new staging deployment IDs from the private inventory, restore only their previous immutable staging versions if needed, revoke only staging grants, and separately approve any fixture deletion. Never redeploy production, alter its library pin/properties, delete shared production data or reuse production URLs as a rollback.

Independent whole-assembly safety review found no Critical/Important local assembly blockers, independently passed the then-current 233-test suite, verified both generated code hashes and confirmed the stored five-page browser receipt. It did not rerun the browser or verify any cloud/device behavior. A subsequent private-output hardening regression failed before the writer guard and passes afterward: every output path is confined to the private output subtree and symlinks/junctions (including existing links) are rejected before writing files. The full final suite passes 234/234.

Deferred minor: the version validator currently also accepts numeric positive integers by coercion, although the default and required operator-supplied manifest version should be a string. Enforce an explicit string check before accepting real staging configuration; this does not alter the default local assembly or permit a production-library fallback. No other actionable review minor remains after clarifying the local clasp denylist wording. Deployment readiness remains unclaimed.
