# Dashboard Presensi revision

- Match the TLD/TDD dark slate/teal/emerald background and green chart-column header icon.
- Title: Dashboard Presensi, in an emerald outlined pill beside the chart icon like TLD/TDD. Subtitle: Daftar Hadir Rapat Internal.
- Proposed description used: “Pilih jadwal rapat dan lengkapi identitas Anda untuk mencatat kehadiran.”
- Per the visual follow-up, the meeting-selector header and dropdown are white, with slate text and teal icon/focus styling matching the TLD/TDD form surfaces.
- Meeting options use dd - mm - yyyy (HH:mm - HH:mm WIB), retaining meeting IDs and original room names.
- Remove numeric section prefixes; use red required markers and “* Wajib diisi”. Preserve optional participant fields. Native required validation switches with the active Diskum/Pemko participant category; associate the external meeting selector with the form.
- Submit button uses the TLD/TDD green gradient and paper-plane icon, including reset/error states; preserve its existing wording.
- Set the GAS page title to Dashboard Presensi for the presensi route only.

Verification: 45 passing tests and Admin/Code.js syntax check. Presensi tests exercise actual dropdown formatting/IDs, required-category switching, preserved employee payloads, and restoring the submit button after failures. Local HTTP response serves the new page. No push/deployment; local server restart unnecessary because the HTML is read per request.
