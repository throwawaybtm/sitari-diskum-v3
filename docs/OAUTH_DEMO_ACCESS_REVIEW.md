# OAuth and client demo access review

Initial implementation reviewed 13 November 2026 against local source. The deployment update below records the subsequent user-approved release. The original investigation and recommendations are retained for context.

## Deployment update on 13 November 2026

The user approved deployment after the implementation review. Admin v50 and Public v21 are now active on their existing deployment IDs. Public pins immutable Admin core v50 with development mode disabled. Earlier versions remain available for rollback, including the previous active Admin v49 and Public v19.

All 312 synthetic regression tests passed before deployment. Unauthenticated HTTP checks returned status 200 with the expected form content for TLD, TDD and Presensi, without a Google sign-in redirect or an authorization error in the initial HTML. These checks do not execute the client-side RPCs. Interactive dropdown, upload and submission checks remain unverified because Computer Use stopped when it could not confidently determine Edge's current URL. No live business records or Drive permissions were modified by testing.

The local ignored employee directory was empty and local private configuration contained placeholders. Before publishing, employee data, PIC contacts, deployment configuration and intake destination directories were restored from the deployed Admin v49 snapshot. The release includes the tested working-tree changes, including existing visit-time and multi-upload corrections. Live Script Properties and the existing demo authorization switches were retained. Anonymous Admin protection remains subject to disabling those demo switches as described below.

The first Public upload was skipped by clasp's manifest confirmation behavior. Public v20 was created before that was detected and was never activated. The manifest was then uploaded explicitly, and corrected Public v21 was created and deployed. Backups and HTTP evidence are stored under ignored output/oauth-release-2026-11-13/. The deployment registry and README reflect the confirmed active versions.

Owner reauthorization may still be required if a service RPC reports missing grants. Initial public page loads completed without a consent prompt. The owner can run a reviewed public read function in the Public Apps Script editor and approve any requested scope. No account consent was automated.

## Root causes and audit

- Public explicitly declares Sheets and Drive scopes. Its pinned core library also calls `Session.getEffectiveUser()`, which requires `userinfo.email`.
- The delegation dropdown calls `Public.getVisitAttendanceRoster` → core `getVisitAttendanceRoster` → `visitAttendanceForAgenda_` → `readVisitWorkflow_`. Workflow reads included Fonnte/dev metadata, which invoked `isPublicDevMode_` → `isPersonalDevEnvironment_` → effective-user identity. TLD attendance submission uses the same workflow reader.
- `Admin/VisitWorkflowStorage.js` contains the effective-user check for the personal demo environment and the active-user check for the Admin allowlist. `Admin/Code.js` uses active identity for audit attribution. The standalone TLD and TDD projects contain no Session calls.
- Admin and both standalone projects use automatic scope inference. Public uses explicit scopes. Only Public needed an additional declared scope for its retained library. Sheets and Drive remain required for configured database access, folder discovery and document storage.
- All four local manifests specify `USER_DEPLOYING` and `ANYONE_ANONYMOUS`. A local manifest does not establish the execution settings of an existing deployment.

## Changes

- Added `userinfo.email` to Public and its manifest generator for compatibility with the pinned library. The deploying owner must grant this scope. The public handlers do not use visitor identity to authorize intake or attendance.
- Attendance workflow reads now omit Admin/demo metadata and meeting-room reads. Local roster and attendance submission complete without calling either identity API.
- Added friendly public error formatting to consolidated TLD, TDD and Presensi, standalone TLD/TDD, and the Admin-hosted Presensi page. OAuth, permission, configuration and common runtime failures show an Indonesian service-unavailable message. Visitor validation messages remain visible.
- Removed automatic bulk publication of visit documents on Admin page load and public-link sharing on new uploads. New documents inherit folder permissions. Existing production permissions require a separate owner review. No production records or permissions were changed.
- Changed the new-install `ADMIN_DEMO_MODE` default to `false`, including its tracked configuration template. Existing explicitly configured demo properties remain effective.
- Retained Admin active-user allowlist checks, server-side guards, upload validation, attendance locks and roster response field restrictions. Effective owner identity is used only by the existing personal-development environment check.

## Verification

`node --test --test-name-pattern='unavailable identity' local-test/test/visit-workflow-gas.test.js` first reproduced the exact reported OAuth failure in all three cases. After the fix, all three pass. They model signed-in guests, signed-out guests and incognito guests with unavailable effective identity. Each exercises real GAS roster and attendance submission code against in-memory Sheets, verifies canonical participant storage, and rejects unauthorized manual attendance.

`node local-test/run-synthetic-tests.js` passes all 312 tests. Coverage includes public registration, document uploads, retrieval, dropdown/attendance behavior, privacy and Admin RPC authorization. The runner uses an isolated temporary copy with synthetic configuration and blocks external networking.

An initial direct run of `gas-merge-security.test.js` passed five tests and failed three because local ignored deployment/intake files differ from the synthetic fixtures. Those failures were the synthetic configuration placeholder check, synthetic PIC expectation and public-dev initialization expectation. The supported synthetic runner resolves those configuration mismatches and passes the complete suite.

Real logged-in, logged-out and incognito browser tests against GAS remain pending. Local simulations cannot prove Google consent behavior, owner grants, Workspace policy, actual deployment access settings or Drive upload permissions. No live submissions or uploads were attempted because this task prohibits production data changes and deployment before review.

## Deployment recommendations and owner steps

1. After code review, inspect Manage deployments for each active project and record its actual execution identity and access. Public TLD/TDD/Presensi should execute as the deploying owner with anonymous access where Workspace policy permits. The owner needs access to the database and private upload folders. Visitors use the deployed `/exec` URL.
2. After approval to apply the manifest change, the Public deploying owner must authorize the revised permissions from the Apps Script editor using a reviewed, read-only public function such as `getMasterData`. Confirm the granted scopes include Sheets, Drive and email. A versioned deployment continues serving its selected published code until an approved release updates it.
3. Keep the Public library pin at 49 for this review. Local core improvements require a separately reviewed published core version and Public dependency update before the new core path can run in GAS. The scope fix supports the retained older core's identity call.
4. For protected client Admin access, disable both `ADMIN_DEMO_MODE` and `PUBLIC_DEV_MODE` in Script Properties. The code still retains previously approved demo bypasses. The personal-development bypass additionally checks the script, owner and spreadsheet binding. Current live property values are unverified, so anonymous Admin protection cannot be certified for the existing deployment.
5. Restrict Admin access to intended signed-in staff. For cross-domain or consumer accounts, execution as the accessing user supports active-user authorization but requires that staff authorize scopes and have appropriate resource access. Owner-executed Admin requires verification that active email is available for every intended staff account. Keep allowlist authorization fail-closed when identity is blank. Public intake remains on its separate public deployment.
6. Verify upload folders and their ancestors are private or limited to intended staff. Review previously published documents separately. New upload code preserves inherited permissions, including any broad permissions already configured on a folder.
7. After an approved release, test all three visitor browser states with controlled demo data. Check TLD/TDD submission, TLD file upload, attendance agenda and delegation selection, repeat/locked attendance behavior, and unauthorized Admin reads/writes. Confirm ordinary visitors receive no Google consent prompt.

## Google references

The Session API documents email scope requirements and context-dependent active identity. Owner execution lets public operations use the deployer's authorization. [Session reference](https://developers.google.com/apps-script/reference/base/session) and [web app execution settings](https://developers.google.com/apps-script/guides/web).

Explicit manifests and owner authorization must include the services used by the script and library. [Authorization scopes](https://developers.google.com/apps-script/concepts/scopes) and [service authorization](https://developers.google.com/apps-script/guides/services/authorization).
