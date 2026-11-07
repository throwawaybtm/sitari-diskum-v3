# SITARI DISKUM v3 - S03D.2A staging readiness review

Date: 8 November 2026 (Asia/Jakarta). Branch: `perf/s03d2-readiness`. Approved base: `bafc0bc8e505e65e4aa924ebb6e17e662b7078f7`. Application source remains pinned to S03C `d1d02475acba50439835c8fcc5b163828897e9ea`.

## 1. Outcome and evidence boundary

Preparation only. No Google API calls, cloud inspection, resource creation, deployment, data changes, notifications or merges were performed. The full S03D and S03D.1 reports and their safety tests were reviewed. This delivery hardens local configuration validation and supplies an operator checklist; it does not establish verified cloud isolation or authorize provisioning.

| Claim | Evidence/status |
|---|---|
| Strict immutable-version syntax, both local validators | Tested, including rejection before output replacement |
| Generated executable code, exports, input/function hashes | Equal to approved S03D.1 baseline for valid default configuration |
| Active Admin/Public/Tamu-Luar/Tamu-FO source and UI | Unchanged |
| Local regression/security suite | 238 passed, zero failed/skipped |
| Fresh independent executable-assembly security review | Results recorded in section 4 before delivery |
| Dedicated identity, resource ownership, effective ACLs | Not inspected; operator evidence required |
| Actual library version existence, scope consent, GAS runtime/hosting compatibility | Not verified; separately approved cloud checks required |
| Cloud or physical-device performance | No samples; no new performance claim |

## 2. Validation fix

`local-test/performance/s03d/immutable-version.cjs` defines one shared predicate used by both `s03d/preflight.cjs::verify` and `s03d1/assemble.cjs::validate`. It accepts only primitive strings containing canonical ASCII decimal positive integers: `[1-9][0-9]*`, with a canonical round-trip and safe-integer representability check. Inputs are never trimmed, normalized or coerced into acceptable strings.

Rejected: numbers (including positive integers), booleans, null/undefined, arrays, objects, boxed strings, coercible objects, BigInt, blank/whitespace, zero/negative values, leading zeros/signs, decimal/exponent/hex notation, floating/development labels, Unicode digits, embedded NUL, trailing newline/whitespace and integers beyond the local safe representability bound. Accepted examples: `"1"`, `"37"`, `"123456789"`. The local bound is `9007199254740991`; this is not a claim about Google's supported version range, publication or existence. An operator must verify the actual immutable staging version separately. A syntactically valid pin is not cloud verification.

Invalid declarations fail before executable assembly generation. Invalid CLI input returns a sanitized failure and leaves previously generated project files byte-identical; it does not erase an earlier valid assembly. Operators must use the exit status and matching private inventory, never mistake stale output for a newly validated declaration. Preflight still returns `cloudIsolationVerified:false` and `deploymentApproved:false` even for valid declarations.

## 3. Inventory and regression evidence

New tests: `local-test/performance/s03d2/readiness.test.cjs`. The tests first failed because numeric versions were accepted and the invalid CLI returned success. After the shared validator fix, all four new tests pass:

1. Both configuration entrypoints reject malformed/coercible versions without invoking object conversion.
2. Valid strings remain exact strings in the Public manifest; staging Admin ID matches, `developmentMode=false`; declaration approval remains false. Fake future URLs are strings only, never requested.
3. An oracle loads the approved base generator from its Git object, generates baseline/current assemblies and compares every project-file byte, all source/function/artifact hashes and exports. Both generated Code.js files compile.
4. Invalid private CLI declarations cannot replace any of the 25 generated project files.

The generated assembly still comprises **25 project files**, 27 pinned source inputs (8 backend modules and 19 HTML files), and 42 original extracted read/pure function bodies. Private configuration and inventory remain under ignored `outputs/performance-s03d1/`; no `.clasp.json` or deployment tool is generated. Inventory tool provenance now also hashes the preflight and shared version validator. Valid default executable artifacts remain unchanged:

| Generated file | SHA-256 |
|---|---|
| Admin/Code.js | `94d09730a89c6d63e622c1790c489f17b55b038fd53f3fb0c494070e07518709` |
| Public/Code.js | `e8e7a5183dc246981aa6e92d9461d7fe2e8b21058238baa891a54d9c5a658739` |
| Admin/Index.html | `b90b6ea3d15f7adfbc133c464527ff41b4034a2bc2b5f5d6160c6f157a5d77ba` |

The complete 27-input hash table remains in the S03D.1 report and the private generated inventory; the oracle verifies it rather than relying on a manually copied table.

Approved RPC exports remain:

- Admin: `doGet`, `getDashboardSummary`, `getTamuList`, `getRapatCalendar`, `getMasterData`, `getMeetingRoomOptions`, `getVisitWorkflow`, `getVisitAttendanceRoster`, `getAgendaAttendance`, `getVisitArchiveDocument`, `getAgendaPhotoDocument`, `getPublicEmployeeCount`, `getPublicFormDestinations`, `getPublicAttendanceMasterData`, `getPublicAttendanceCalendar`.
- Public: `doGet`, `getMasterData`, `getRapatCalendar`, `getVisitAttendanceRoster`. These forward only to the bounded staging-library Public APIs. No privileged workflow/document endpoint is forwarded.

The full suite retains tests for generated export enumeration, exact static markup/styles and evaluated page output, all approved read interactions, cohorts 20/200/1,000, authorization, identity/resource/URL/payload rejection, missing tables, unsupported MIME, backend mutation denial, HTTP loopback isolation and telemetry teardown. Already-pending callbacks/frames remain unable to append telemetry after stop. No new browser run was performed in this milestone: the S03D.1 five-page/27-check receipt is historical evidence. Local HTTP/VM checks are rerun; neither pixel equivalence with external assets nor real GAS/browser behavior is claimed.

Reproduce from the repository root with the approved Git objects and authorized excluded local test configuration available:

```powershell
node local-test/performance/s03d1/assemble.cjs
node --test local-test/test/*.test.js local-test/performance/s02/harness.test.cjs local-test/performance/s03a/calendar.test.cjs local-test/performance/s03b/startup.test.cjs local-test/performance/s03c/*.test.cjs local-test/performance/s03d/*.test.cjs local-test/performance/s03d1/*.test.cjs local-test/performance/s03d2/*.test.cjs
git diff --check
git diff --exit-code bafc0bc8e505e65e4aa924ebb6e17e662b7078f7 -- Admin Public Tamu-Luar Tamu-FO
```

## 4. Security review and remaining local boundaries

The fresh independent review inspected the executable generated Admin/Public assembly, not merely the small validator diff. It reported **no Critical, Important or Minor code/security findings for preparation-only delivery**. The reviewer independently passed all 238 tests, checked the unchanged active application directories, compared all 25 on-disk generated project files with the current default assembly, and verified 42 function bodies, 27 pinned inputs and both Code.js hashes against this report. It reviewed the browser/backend boundaries and URL-reservation/A-N-B pinning procedure. No new browser or cloud test was performed by the reviewer. This is a local security review, not a cloud-isolation or deployment-readiness certification.

Retained defenses: exact-ID read capabilities; no active-spreadsheet or Drive discovery fallback; all ten tables required; initialization/setup/migration modules excluded; original approver check with demo mode false; no reachable upload/registration/notification/attendance-submit/approval/reschedule/write RPC; no raw service handles escaping the core; bounded Public wrappers; explicit synthetic document allowlist and PDF/PNG/JPEG-only reads; no conversion/sharing/permission writes; bridge and backend read allowlists; sanitized numeric telemetry; ignored private output and symlink/junction rejection.

Production denylist procedure remains local: read only project identifiers from existing local clasp files/registry for overlap rejection, without copying configuration or accessing credentials/services. That inventory cannot prove an unknown ID is staging. Account isolation and effective sharing must be independently checked by the operator. Read-only OAuth scopes also do not prove the account cannot read production.

## 5. Proposed permissions and settings

These are proposed settings encoded in the reviewed manifest templates, not verified grants:

| Setting | Admin | Public |
|---|---|---|
| Runtime/timezone | V8 / Asia/Jakarta | V8 / Asia/Jakarta |
| Exception logging | NONE | NONE |
| Web-app execution/access | USER_ACCESSING / MYSELF initially | USER_ACCESSING / MYSELF initially |
| Library | No production dependency | SiTariCore -> newly owned staging Admin script, actual immutable version string, developmentMode=false |

Both propose exactly these runtime OAuth scopes:

- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

No full Drive/Sheets write scope, external-request scope, service-account delegation or production token is part of the assembly. The runtime's synthetic approver is replaced only with the dedicated test identity in private configuration; do not enable demo mode or remove original authorization. If MYSELF/accessing-user prevents a Public/library scenario or email is unavailable, stop and review; do not silently use owner execution, ANYONE, broader scopes or production credentials.

Provisioning requires separate **operator** permissions: sign in to the dedicated account, create/manage its own new Drive folder/files and spreadsheet, edit synthetic cells, create two standalone Apps Script projects, and manage their staging versions/deployments. These setup writes are outside the read-only runtime. Manual console/UI provisioning is the proposed path; no automated provisioner, clasp authorization or script-management credentials are supplied. Any automated setup tool, additional scope, organizational consent or standard-GCP/IAM requirement needs a separate reviewed plan. No Firebase or billing change is requested.

## 6. Operator provisioning checklist and approval gates

Every item below is a **future operator action**, not an action performed or authorized by this delivery. Store account emails, resource/deployment IDs, private URLs, ACL evidence and receipts only in ignored private output; this report deliberately contains no real target values. Do not store passwords/tokens in configuration or diagnostics.

### A. Approve isolation inspection and provisioning, then establish identity

- [ ] Obtain explicit approval for dedicated staging-account inspection and the exact new-resource creation/seed/upload operations. Approval must state targets, owner, scopes and rollback. No cloud inspection before that approval.
- [ ] Operator confirms the dedicated account has no production memberships, shared drives, inherited/direct shares, delegated access or production credential stores. Record effective access evidence, not just a checkbox declaration. Organization-wide access needs particular review.
- [ ] Confirm the operator may create the new resources and manage script versions/deployments. Use a separate browser/account profile; never copy production clasp files, Script Properties, OAuth tokens, private employee/contact directories, Sheets or Drive folders.
- [ ] Create one new private synthetic folder, one new private spreadsheet, and two new standalone projects (Admin and Public) owned by the dedicated account. Record exact new IDs and compare against the full operator production inventory and local denylist. Keep access restricted to the approved test identity initially. Do not use public-link sharing.

### B. Seed synthetic resources separately from read benchmarking

- [ ] Generate the chosen 20/200/1,000 local cohort with `s03d/fixtures.cjs`. Review data as invented only. Create all tables/headers manually or through a separately approved seeder; exports contain **data rows only**, not a schema initializer.
- [ ] Match current read column layouts: Master_Pegawai 9 (including Pangkat / Golongan), Master_OPD 3, Master_Ruangan 6, Data_Tamu 21, Data_Rapat 14, Data_Presensi 13, Kendali_SPPD 17. Pad shorter fixture rows with blanks rather than treating their length as the schema.
- [ ] Create Alur_Kunjungan with 4 columns (Kode Kunjungan, Versi, Data Alur JSON, Diperbarui); Dokumen_Agenda with 3 (Agenda ID, Dokumen JSON, Diperbarui); Foto_Agenda with 3 (Agenda ID, Foto JSON, Diperbarui). Use the pinned reader/setup header definitions for the other tables without executing production Setup or migrations. Set spreadsheet timezone Asia/Jakarta; preserve fixture wall-time/date text and joins.
- [ ] Verify visitor code -> workflow code; workflow booking ID -> meeting ID; VISIT-code references; attendance agenda ID -> meeting ID; document/photo agenda ID -> meeting ID. Avoid automatic date/time coercion during import.
- [ ] Upload only locally generated synthetic PDF and PNG files to the new private folder. Set visit letters/notula/archive references to the new PDF ID and photo references to the distinct PNG ID with matching MIME/name, including nested JSON. The raw fixture exporter reuses placeholder URLs; do not blindly map every placeholder to the PDF. Include both new IDs in the document allowlist. No real documents or public-sharing changes.
- [ ] Validate every URL/ID privately against the staging inventory; unknown, missing, cross-project or production references are a stop condition. Freeze fixtures for measurement; no initializer or repair path is used by reads.

### C. Reserve identities/URLs and approve exact assembly

- [ ] New project script IDs are not deployment IDs. Final configuration also needs each project's new `/exec` URL. If unavailable, separately request approval for an **inert deny-all bootstrap deployment** of each new project solely to reserve URLs. Its code, scopes, MYSELF access and no-data/no-library behavior require review first; no bootstrap is delivered or authorized here. Alternatively the operator supplies already verified staging-only reserved URLs.
- [ ] Keep the real declaration under ignored `outputs/performance-s03d1/`. Validate exact script IDs, distinct staging URLs, synthetic spreadsheet/document IDs, dedicated approver and canonical version string. A passing local declaration still gives no cloud verification or deployment approval.
- [ ] Generate and independently review actual configured outputs, all input/tool/artifact hashes, manifests and RPC lists. Private receipt must map each project identity to its exact output directory and hash. Never deploy from tracked Admin/Public or an unrelated/stale generated directory. Real configuration changes embedded Code.js hashes; default hashes above are not proof for real targets.

### D. Publish and pin without a version/self-reference loop

- [ ] Obtain explicit approval for the exact staging-only Admin publication and final Admin/Public deployment actions, access modes, requested consent scopes, prepared artifacts and rollback. This is separate from setup approval.
- [ ] **Two-snapshot procedure:** retain reviewed Admin snapshot A, publish it once as an immutable staging version, then record the actual assigned version N and Admin A hash. The Admin's embedded `publicLibraryVersion` is descriptive and unused by its runtime; any provisional string in A must not be treated as the actual Public pin.
- [ ] Generate Public snapshot B with the actual published canonical string N and exact staging Admin script ID. Review the Public manifest and artifacts again, then deploy **only Public B** alongside the retained approved Admin A. Do not push regenerated Admin B merely because the config's descriptive version changed: that would change its bytes and invite an unnecessary republish loop. Record the final A/N/B relationship and require approval for those precise artifacts.
- [ ] Verify in the operator's project UI that Public uses SiTariCore, the staging Admin ID and existing immutable N with developmentMode=false. No production library pin or fallback is permitted. Update only reserved staging deployment IDs with their reviewed snapshots; record actual deployed hashes/version receipts privately.
- [ ] Verify consent matches the three proposed scopes and MYSELF/accessing-user settings. Unexpected scope expansion or identity mismatch is a stop condition, not permission to broaden access.

### E. Separately approve read-only smoke tests and measurements

- [ ] Present resource/ACL/identity evidence and deployed artifact receipts for review, then obtain explicit approval for the exact staging URLs and read-only scenarios. No live approval/save/upload/notification/attendance submission is part of this plan.
- [ ] Smoke-test real HtmlService includes/template callbacks, native bridge, CSP/CDN assets, library script identity and caller email, Admin denial for unauthorized callers, Public API boundaries, and private synthetic PDF/PNG preview. These are unverified GAS integration assumptions; stop if any fail.
- [ ] Confirm missing tables/files and write endpoints fail without creating/repairing anything. Review resource-change evidence where available; never invoke production initialization as a test. Preserve read-only telemetry, no raw sensitive diagnostics in Git.
- [ ] Only after smoke checks pass, use the S03D first-observed/repeated desktop/actual-mobile protocol. Keep browser/RPC/server/Sheets/Drive timings separate. No cloud timing is inferred from Node tests.

## 7. Remaining blockers and rollback

Local strict validation and regression evidence are complete; cloud readiness is conditional. Outstanding: explicit staged approvals; verified dedicated ownership/effective ACLs; new private resources with correctly joined schemas/documents; reserved staging URLs; published immutable staging library receipt; actual-config artifact review; consent/identity/native GAS/CSP/preview smoke tests; and real performance samples. Local passing declarations, placeholder IDs and an independent code review cannot resolve these cloud-specific facts.

Rollback before cloud actions: stop any local host/probe, retain private evidence or regenerate ignored output from the approved source. No production restoration is needed. Never deploy merely to test rollback.

After separately approved future setup/deployment: stop measurements and disable/archive only recorded staging web-app deployments; preserve the private evidence and A/N/B hashes; restore only a previously approved immutable staging snapshot if appropriate. Revoke only staging-specific grants. Delete synthetic files/projects or the test account only with separate cleanup approval after checking the exact private inventory and ownership. Do not touch production projects, library pins, data, document permissions, backups or URLs. If a scope/ACL mismatch or unexpected production reference appears, stop, restrict staging access and request review rather than trying a production fallback.

## 8. Delivery scope

Only the shared local validator, two validator integrations/tool provenance, four local tests and this report are intended for commit. Private generated artifacts, configuration, synthetic exports and diagnostics remain excluded. Active application source is unchanged; S03A-C optimizations and approved UI remain intact. No performance optimization, Firebase work, merge or deployment is included.
