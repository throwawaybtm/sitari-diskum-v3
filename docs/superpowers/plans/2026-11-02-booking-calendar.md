# Booking calendar first version

User requested an initial calendar for all agenda types with date selection opening room/time/agenda details, then iterative revisions.

Implementation: collapsible monthly calendar in Jadwal Rapat below room cards; month navigation, current-month shortcut and booking counts on dates. Date popup contains Ruangan, Jam (24h WIB) and Agenda (title with TLD/TDD/Internal badge). Empty days remain selectable. Cancelled agendas excluded; past and completed bookings retained. Uses the full loaded agenda list independently of search filters, avoiding new RPC calls. Existing room booking and conflict logic unchanged.

Files: Admin/BookingCalendar.html (scoped UI and pure grouping helpers), Admin/Index.html (include and load-state hooks), local-test/server.js (template support), local-test/test/booking-calendar.test.js (grouping, dates, escaping, states).

Steps: backup; test model and dialog; implement; run full suite; inspect desktop/mobile in VS Code; deploy Admin only and verify; update deployment snapshot and validation. Public library remains unchanged because no backend API changes.
