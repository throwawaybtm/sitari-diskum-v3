# SITARI DISKUM v3 — Antigravity Work-PC Handoff

Prepared 11 November 2026 (Asia/Jakarta).

## Purpose

Use this handoff to continue client-directed SITARI development on the work PC without repeating the prior assessment. The immediate priority is the next client revision. Admin unlock work and performance auditing are deferred unless the client explicitly asks for them.

## Trusted checkpoint

- Repository: `https://github.com/throwawaybtm/sitari-diskum-v3.git`
- Branch: `client/revisions-2026-11-10`
- Commit: `b78d2de286aa504a0f811b0f263a9a139a6c6a14`
- Commit subject: `feat(rapat): add meeting workflow and locking`
- Remote branch: `origin/client/revisions-2026-11-10`
- Reported state after push: local HEAD, upstream, and remote HEAD all matched; working tree was clean.
- Reported regression baseline: **222/222 tests passed**, with 0 failures and 0 skipped.

This checkpoint was pushed by a normal fast-forward (`83347c2..b78d2de`). No force push, merge, Google Apps Script deployment, or `Public/` rebuild was performed.

## Revision history on this branch

| Revision | Checkpoint | Summary | Status |
|---|---:|---|---|
| R01 | `b18d471` | TDD Rombongan revision | Committed and pushed |
| R02 | `83347c2` | Rapat Pimpinan revision | Committed and pushed |
| R03 | included in `b78d2de` | Internal meeting workflow changes | Committed and pushed |
| R04 | included in `b78d2de` | Meeting locking and related workflow changes | Committed and pushed |

The R03/R04 checkpoint changed 28 tracked files (26 modified, 2 added) across `Admin/` and `local-test/`. The two new tests were reported as `rapat-internal-rev03.test.js` and `rapat-internal-rev04.test.js`.

> Verification note: the short revision labels above come from the prior development session. Confirm the exact client wording in the repository history/specs before presenting them as formal release-note titles.

## Architecture orientation

SITARI is a Google Apps Script application with several authoring/deployment surfaces:

- `Admin/` contains the internal/Admin web-app source, including server-side `.js` Apps Script modules and HTML client views.
- `Public/` contains generated or release-prepared public-facing artifacts. Treat it as a release output when the repository build process says so; do not hand-edit or rebuild it casually.
- `Tamu-Luar/` and `Tamu-FO/` contain guest/front-office flows and their own configuration seams.
- `local-test/` contains the Node-based local harness, fixtures, and regression tests.
- `maintenance/build-public.js` is the reported release build path for synchronizing relevant Admin authoring content into `Public/` using an approved immutable Admin library version.
- Apps Script manifests such as `Admin/appsscript.json` define deployment identity/access behavior and are security-sensitive.

The application mixes Apps Script server functions with HTML/JavaScript views. Preserve server-side authorization and lock enforcement even when changing UI behavior. A passing local browser/UI test does not replace checking the Apps Script boundary.

> Repository-specific verification required: confirm the current directory roles, build command syntax, deployment manifests, library/version convention, and test entry points after cloning. This handoff is based on the recorded session, not a fresh inspection of the full repository.

## Private, gitignored configuration

GitHub intentionally does not carry the environment-specific configuration. The prior session identified at least these paths:

- `Admin/DeploymentConfig.js`
- `Admin/EmployeeDirectory.js`
- `Admin/VisitPicContacts.js`
- `Admin/PublicIntake.js`
- `Tamu-FO/Destinations.js`
- `Tamu-Luar/Destinations.js`

Restore approved development copies through a secure channel, or create safe local versions from the repository's configuration templates. Check only their presence and expected shape in logs; never print their contents. Never commit credentials, API tokens, real phone numbers, employee data, or deployment-specific identifiers.

The earlier environment also referred to additional private test originals, for a reported total of ten ignored paths. **Verify the authoritative ignored-file list with `.gitignore`, templates, and local documentation on the work PC** rather than assuming the six paths above are exhaustive.

## Fonnte integration

SITARI uses Fonnte for WhatsApp/message delivery. Treat its token, destination numbers, templates containing personal information, and any live-send switches as secrets or production-impacting configuration.

For ordinary client revision work:

- use mocks/fixtures in local tests;
- avoid live Fonnte requests;
- do not expose tokens or real phone literals in diffs, prompts, screenshots, or logs;
- require explicit approval before any real notification is sent.

> Verification note: locate the current Fonnte adapter/configuration and its tests before modifying notification behavior. The precise module and configuration keys were not available in this project mirror.

## Known release-only drift

`Admin/AttendancePolicy.html` reportedly contains the newer `Ditunda` and `locked`/`Terkunci` client rules, while `Public/AttendancePolicy.html` still contains the earlier generated template. This is intentional pending release preparation, not a reason to rebuild during feature development.

During an approved release, verify the drift and use the repository's reviewed build procedure, reported as:

```powershell
node maintenance/build-public.js <AdminVersion>
```

Use an approved immutable Admin library version, inspect the generated diff, rerun the relevant tests, and deploy only with explicit authorization. Do not claim R03/R04 are production-synchronized until this has been completed and verified.

## Deferred work

### Admin unlock

The requested `Buka Kunci` action was deliberately not implemented. The recorded concern was that `Admin/appsscript.json` used `ANYONE_ANONYMOUS` with `USER_DEPLOYING`, while `ADMIN_DEMO_MODE` reportedly defaulted to `'true'`. Under that model, `requireVisitAdmin_` could not reliably prove the caller's identity for an in-app unlock action.

Keep the existing server-side locks enforced. Do not weaken authentication, add a client-only bypass, or infer that anonymous access is an authenticated Admin session. Revisit unlock only as a separately approved authentication/security milestone.

### Performance audit

Performance/staging investigation is also deferred. Earlier optimization work and a separate Windows byte-level staging mismatch were outside the client revision scope. Do not restart profiling, staging attribution, cloud isolation, or deployment work unless asked.

## Work-PC setup and readiness check

1. Clone the exact branch:

   ```powershell
   git clone -b client/revisions-2026-11-10 https://github.com/throwawaybtm/sitari-diskum-v3.git
   ```

2. Confirm the checked-out branch and commit are `client/revisions-2026-11-10` and `b78d2de` (or a later explicitly expected checkpoint).
3. Read the repository's `AGENTS.md`, `README.md`, relevant specs/progress notes, `.gitignore`, and config templates.
4. Restore private development configuration securely. Check presence only; do not display values.
5. Confirm the working tree is clean before changes.
6. Run the baseline:

   ```powershell
   node --test local-test/test/*.test.js
   ```

7. Expect 222 passing tests at `b78d2de`. If the count/result differs, investigate environment/configuration and Node compatibility before changing application code.

The former machine reported Node.js `24.22.0`, npm `11.19.1`, Git `2.54.0.windows.1`, and `core.autocrlf=false`. Treat these as diagnostic context, not mandatory versions, unless repository documentation confirms them. Byte-sensitive tests make line-ending changes worth checking.

## Safe revision workflow

1. Start with `git pull --ff-only`, then verify the branch, HEAD, and clean status.
2. Convert the client's request into explicit acceptance criteria and identify the smallest affected surface.
3. Inspect the nearest implementation and tests before editing.
4. Add or update focused tests where useful; make the smallest coherent change.
5. Run focused tests, then the complete local suite.
6. Review the entire diff for unrelated edits, generated files, line-ending churn, secrets, tokens, and real contact data.
7. Commit a coherent checkpoint. Push normally only when asked or when the agreed workflow calls for synchronization.

Do not run `clasp push`, create/deploy Apps Script versions, rebuild `Public/`, alter Google resources, send Fonnte messages, reset live data, merge, force-push, or publish without explicit approval.

## Current next step

Obtain the next client revision (R05 or the client's own numbering), clarify its acceptance criteria, and implement only that scope. Preserve all R01–R04 behavior and the server-side locking boundary. Admin unlock, performance auditing, and release-only Public synchronization remain outside the active feature scope.

## Compact startup prompt

```text
Continue SITARI DISKUM v3 from branch client/revisions-2026-11-10 at commit b78d2de. Read AGENTS.md and SITARI_ANTIGRAVITY_HANDOFF.md. Verify branch/HEAD/clean status, verify required private config by presence only, and run node --test local-test/test/*.test.js; expected baseline is 222/222.

Do not modify code during readiness checking. Do not print private config, send Fonnte messages, rebuild Public/, deploy GAS, weaken server locks, or resume Admin unlock/performance work. Report any repo-specific detail in this handoff that does not match the clone. Then wait for the next client revision.
```
