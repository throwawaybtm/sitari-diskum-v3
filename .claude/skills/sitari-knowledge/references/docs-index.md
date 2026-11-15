# Docs index (open only when needed)

Current and authoritative:
- `AGENTS.md` - shared agent rules (Codex, Antigravity, Claude Code via CLAUDE.md import).
- `docs/LOCAL_SETUP.md` - setup and the ignored-file inventory.
- `local-test/SYNTHETIC_TESTS.md` - runner notes.
- `docs/adr/0001-use-fonnte-for-whatsapp-notifications.md`, `docs/adr/0002-separate-public-intake-from-private-administration.md` (0002 describes the earlier three-project arrangement; the principle still holds).
- `docs/superpowers/specs/2026-11-01-two-project-app.md` and `plans/2026-11-01-two-project-app.md` - the current consolidated Admin + Public topology.

Workflow and context:
- `SITARI_AGENT_SKILLS.md` - working style (orient, smallest change, layered verification). Its "no ceremony" rule overrides Superpowers' always-invoke rule.
- `SITARI_ANTIGRAVITY_HANDOFF.md` - work-PC handoff (11 Nov; checkpoint b78d2de, 222 tests). Historical for numbers.
- `GLOSSARY.md` - domain terms: apps (Admin, Tamu FO = TDD intake, Tamu Luar = TLD intake), visit workflow statuses (Permohonan Kunjungan, Menunggu Konfirmasi, Dikonfirmasi, Selesai, Ditolak, Dibatalkan, Check-in FO ...), staff roles, SPPD verification, WhatsApp notifications. Meeting states Ditunda / Terkunci are defined in code (`MeetingRooms.js`, `AttendancePolicy.html`), not in the glossary.
- `TEAM_AUDIT_2026-10-18.md`, `docs/REPOSITORY_BASELINE.md`, `docs/PRESENSI_REVIEW_2026-11-01.md`, `docs/LESS_PAPER_RECOMMENDATIONS.md`.

Dated specs/plans (`docs/superpowers/specs|plans/2026-10-25 .. 2026-11-02`): per-feature history (Buku Tamu, TDD/TLD forms, visit workflow, less paper, mobile, attendance, booking calendar). Use for intent; reconcile with current code because some behavior was superseded. New Superpowers specs/plans go in the same folders.

Performance (`docs/performance/*`): deferred work; large files, do not load unless the owner reopens performance.

Historical until checked: `README.md` deployment numbers, `deployments/2026-11-01/projects.json`.

Outside the repo (claude.ai Project "SITARI V3"): Product Requirements Document, Development Handover Book (15 Nov 2026; release/rollback sequence, owner smoke checklist, open client revisions), Claude Code install runbook.
