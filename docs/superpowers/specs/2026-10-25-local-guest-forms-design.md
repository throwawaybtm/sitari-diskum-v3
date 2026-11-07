# Local Guest Forms Design

## Intent

Make the standalone TLD and TDD/FO forms fully usable from the existing local Admin preview so upcoming field revisions can be tested without Google Apps Script, Sheets, or Drive.

## Selected approach

Serve the production form HTML unchanged at `/tamu-luar` and `/tamu-fo`. Their existing local `fetch('/api/...')` fallbacks submit to an in-memory fixture store. Successful submissions are appended to the visitor list used by `getTamuList` and dashboard responses, and disappear when the server restarts.

The local Admin renderer injects a visitor change check every two seconds and when returning to the tab. Changed data reloads the Admin panels so submitted visitors appear without a manual refresh. FO timestamps use Jakarta time at submission. Attachments are discarded locally and the existing 1 MiB request limit applies.

## Constraints

- All dummy and simulation logic remains under `local-test/`.
- Do not change production behavior in `Admin/`, `Tamu-FO/`, or `Tamu-Luar/`.
- Local responses must contain the fields expected by each success modal.
- TLD and TDD identifiers use their production-style prefixes and a shared monthly serial.
- Restart the local server after verification and refresh the existing local view if browser control permits it.

