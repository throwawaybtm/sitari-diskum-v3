# Jadwal Rapat revision

Implemented per user request:

- Jadwal Rapat Internal heading with the tab's calendar-days icon.
- Description: “Informasi Kegiatan Rapat Internal Diskum”.
- Dashboard Presensi with chart-column icon and teal/sky/blue gradient. Jadwalkan Rapat uses the same styling, 160px width, minimum 40px height, and calendar-plus icon.
- Three rooms, preserving original names per follow-up: Ruang Rapat Utama Diskum (50), Ruang Konsultasi Koperasi & UMKM (5), Ruang Rapat Pimpinan / Kadis (10). Remove Aula from available rooms and floor labels from cards/dropdown.
- Agenda Rapat Internal; per-room badges blue/emerald/violet; displayed meeting dates use dd - mm - yyyy, including the QR modal subtitle.
- Completed/overdue meeting actions say “Rapat selesai”, are grey and disabled, and have no click handler. A meeting expires when Jakarta time reaches its scheduled end timestamp. Recheck on focus and every 30 seconds; guard stale attempts to open the QR modal.

Room settings live in `Admin/MeetingRooms.js` and are supplied to the Admin template and local harness. getMasterData normalizes the existing Master_Ruangan room metadata while retaining sheet IDs. This updates the app's effective room list; it does not delete sheet rows or rewrite historical bookings. Scheduling dropdowns and historical name aliases use the revised canonical names. Unrecognized historical room badges remain readable.

Modal follow-up: title bar and Jadwalkan submit button use the Dashboard Presensi teal/sky/blue gradient. All eight fields are mandatory, each label has a red asterisk, and the modal includes “* Wajib diisi”. Pimpinan Rapat and Agenda/Keterangan are now required. Browser validity is checked before disabling the button; backend and local validation reject empty/whitespace fields and invalid dates/time ranges. Success/error handlers restore “Jadwalkan”. Verified with 42 passing tests and a live local empty-request rejection. Local server restarted with PID 7316.

Backup: `backups/admin-before-meeting-revision_2026-10-26_211323.zip`.
Verification: 39 tests passed, including cutoff/Jakarta midnight behavior, active/disabled actions, stale QR clicks, room capacities and IDs, and matching action-button classes. Syntax checks passed. Local server restarted on port 4173 (PID 5808); HTTP master data reports all three rooms with 50/5/10 capacities. Refreshed the local Jadwal Rapat tab and visually confirmed headings, cards, dates, room colours, the disabled past-meeting action, and the active future-meeting action. No GAS deployment performed.
