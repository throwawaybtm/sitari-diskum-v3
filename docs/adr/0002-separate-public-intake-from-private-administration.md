# Separate public intake from private administration

SI-TAMU will remain three Google Apps Script projects: a private Admin App, a public Tamu FO intake app, and a public Tamu Luar intake app, all connected to one shared Google Sheets database. This keeps anonymous intake surfaces separate from privileged administration while preserving one operational record source; recombining the apps would blur access boundaries, while separate databases would create synchronization and reporting problems.

## Consequences

- Each project retains its own clasp configuration and deployment.
- Public projects expose only bounded intake and cancellation operations.
- Administrative reads, corrections, approvals, document handling, and audit views remain in the private project.
- Shared schema changes require coordinated compatibility checks across all three projects.
