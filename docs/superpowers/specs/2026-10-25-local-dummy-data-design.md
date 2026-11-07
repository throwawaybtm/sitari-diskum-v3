# Local Dummy Data Test Harness

## Intent

Create a safe local testing environment for the current Si Tari v33 code so the Admin dashboard can be exercised with realistic-looking records without writing anything to the shared Google Sheet or deploying dummy data to Google Apps Script.

## Goals

- Display clearly marked dummy visitors, meetings, rooms, staff, OPDs, and SPPD states through the existing Admin UI.
- Reuse the Admin app's existing local `/api/<function>` fallback so production rendering stays representative.
- Keep all fixture records and mock-server code outside `Admin/`, `Tamu-FO/`, and `Tamu-Luar/`.
- Create and verify a ZIP archive after the local harness works, before any later product changes begin.
- Make it mechanically verifiable that clasp cannot upload the dummy records.

## Non-goals

- Do not write dummy records into Google Sheets or Google Drive.
- Do not deploy or version a new GAS release.
- Do not add a production `demo` switch or hidden sample-data fallback.
- Do not send WhatsApp messages or call Fonnte.
- Do not make dummy writes persistent across server restarts in this first version.

## Constraints and safety rules

- Every fictional value must be visibly identifiable with a `[DUMMY]` prefix or equivalent test marker.
- The harness will use Node.js built-in modules only; no new dependency installation is required.
- Local responses must follow the current shapes returned by `getDashboardData`, `getTamuList`, `getRapatCalendar`, `getSppdList`, and `getMasterData`.
- Dates for “today” content will be generated at runtime in the Asia/Jakarta timezone so dashboard cards remain useful on future test days.
- Unsupported mutations must return an explicit simulated/unsupported response rather than touching live services.

## Approaches considered

1. **Local mock API — selected.** Best production isolation and uses the app's existing browser fallback. Dummy data remains outside every clasp project.
2. **Demo query switch inside Admin.** Easier to launch, but demo code would be part of the deployable GAS source and could accidentally be exposed.
3. **Separate Admin demo copy.** Strong isolation, but likely to drift as the real Admin app changes.

## Selected design

- Add a top-level `local-test/` directory containing:
  - a fixture module with dummy response objects;
  - a small HTTP server that renders the current Admin HTML locally, expands the stylesheet include, substitutes safe local URLs for GAS template values, and serves `/api/<function>` responses;
  - a short README with one launch command and the local URL.
- Cover the Admin read paths and master-data dropdowns first. Scheduling and attendance submissions will return safe in-memory simulated results only when needed for UI testing; they will never call GAS, Sheets, Drive, or Fonnte.
- Keep the three application directories free of dummy record literals.
- After validation, create `backups/si-tari-v33-local-test-baseline_2026-10-25_<time>.zip` containing the three apps, documentation, and local test harness, while excluding existing backups and temporary files.

## Verification and completion

- Start the local server and verify all mock endpoints return successful JSON.
- Verify the rendered Admin page contains the dummy records and no unexpanded GAS template tags.
- Run syntax checks on the server and fixture modules.
- Run `clasp status` in each GAS project and confirm `local-test/` is absent.
- Search all three GAS project directories and confirm dummy identifiers are absent.
- Create the baseline ZIP, list its contents, calculate SHA-256, and report its path.

## Remaining builder decisions

- Choose a free localhost port automatically, with `4173` as the default.
- Use a compact fixture set that covers empty/incomplete/approved SPPD states, FO and outside visitors, and current/future meetings without attempting exhaustive test coverage.

## User revision ? 2026-10-27

The user explicitly requested a fresh fictional data set without the word "dummy" in its visible values. This supersedes the earlier visible-marker requirement. Keep the records isolated under local-test and excluded from clasp projects; do not restore markers to the records.
