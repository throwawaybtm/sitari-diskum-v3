# Phone layout and readability revision

## Intent

Make every SI-TARI feature comfortable for older staff using phones. Preserve the current desktop appearance, palette, business rules and data. All layout overrides apply below 768 CSS pixels; desktop rules remain unchanged. This is a presentation revision rather than a workflow redesign.

## Approach

Use a single-column card layout on phones, with readable text and labeled actions. A three-column guest table would squeeze long institution and department names; a separate mobile application would duplicate the workflow unnecessarily. Cards reuse the existing records, actions and backend.

## Phone design

- Body and form controls: 16px, labels and secondary text at least 14px, section titles 20–22px; comfortable line spacing and dark text. No tiny uppercase paragraphs. Controls and labeled buttons at least 48px high; checkboxes visibly larger with the whole label tappable. Inputs do not trigger automatic iOS text zoom.
- Header: compact brand and readable date/clock without collision. Existing four-item bottom navigation remains, with readable labels, clear active state and safe-area spacing. No content or actions hidden behind the navigation or keyboard.
- Dashboard: readable summary cards, two per row when space permits and one per row on very narrow phones. Recent visitors use the same compact guest layout. Meeting cards stack their content and actions.
- Buku Tamu: each guest card shows **Asal Instansi**, **Detail Tamu** (name, headcount, WhatsApp) and **Bidang Tujuan**. Show a status badge and a large existing EDIT/VIEW action at the bottom so staff can identify the next task. Keep ID, date/time, address, full agenda and receiver details inside the existing visit modal rather than repeating them on the card. Non-SPPD retains its existing disabled action. Search/date filters and form links stack at full width. Add a labeled phone-only sorting selector because table column headers are hidden on phones; reuse the existing sorting logic.
- Jadwal Rapat: room badges wrap; full meeting title, room, date/time and status remain readable. Search, date and scheduling controls stack. QR, manual attendance and E-notula actions retain their permissions and use full-width labeled buttons.
- Visit EDIT/VIEW: nearly full-screen phone modal with visible close control, a two-column grid of numbered/named workflow tabs (no tiny sideways tab strip), one-column fields and document previews. Attendance rows become labeled blocks rather than a wide table. Existing save, upload, view, download and archive actions remain accessible. Manual attendance has large member labels and job-title fields.
- Other modals: scheduling, QR display, file uploads and monthly reports adapt to phone width. Forms stack vertically; long filenames and department names wrap. Monthly report rows become readable labeled entries on phones; export retains the existing full report format.
- TLD, TDD and Dashboard Presensi: retain the current visual style, but increase labels, help text, options and touch targets; stack fields and destination/information cards. Camera option remains phone-only. Keep all validation and agenda selection behavior unchanged.
- Loading, error, empty and toast messages use readable text and fit the phone width. Respect browser text zoom and avoid horizontal page scrolling.

## Scope and safety

Back up Admin, Tamu-Luar, Tamu-FO and local-test before implementation. Do not change database schemas, document sharing, notification behavior or completion rules. Preserve compatibility with existing visitor records.

## Verification

Run existing tests plus behavioral checks for any phone-only controls. Inspect all tabs, workflow stages and three standalone forms at 360px and 390px phone widths, and a narrow 320px check. Check long names, populated/empty/error states, modal scrolling and action reachability. Compare desktop screenshots before/after at the same viewport and data; investigate any desktop appearance change. Verify exported reports retain their full contents. Prepare the local preview for user review before publishing.
