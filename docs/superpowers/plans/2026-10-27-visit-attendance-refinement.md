# Visit attendance and button refinement

User-directed scope: show send/save icons before notification/booking and disabled checkmark success labels afterward; keep booking fields visibly disabled until notification success. Use registered ketua/member names for QR attendance, and add admin manual attendance beside QR for TLD agendas only.

- [x] Add shared roster parsing/resolution and duplicate detection; preserve commas in academic titles and deduplicate repeated ketua names. Use one member per line (or semicolon) and update the TLD hint.
- [x] Add read-only public roster endpoint for booked visit agendas; validate QR selections against that roster. Admin-only bulk/manual attendance uses the same stored roster and cannot alter validated/completed attendance.
- [x] Update notification booking buttons/fields; retain saved disabled booking state when reviewing the tab.
- [x] Add registered-name dropdown to TLD attendance and manual attendance modal/button on calendar cards. Keep internal attendance unchanged.
- [x] Verify shared/local/GAS rules, duplicates, cross-visit names, button states, scripts, and local server; restart/refresh when done.

No live messaging or deployment. Local records still reset on restart.
