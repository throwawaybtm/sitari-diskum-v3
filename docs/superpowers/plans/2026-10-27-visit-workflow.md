# Visit Workflow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task in the current workspace. No Git repository is present; preserve changes through the existing archive workflow.

**Goal:** Build the agreed six-tab visit workflow with local end-to-end testing.

**Architecture:** Separate guarded workflow rules from browser presentation and GAS/local storage. Link visit reservations to real calendar agenda IDs so the existing attendance form feeds KEDATANGAN.

**Tech Stack:** Apps Script JavaScript, HTML/CSS, Node built-in HTTP/VM/test.

**Spec:** ../specs/2026-10-27-visit-workflow-design.md

## Global constraints

- Every new TLD starts at Menunggu Konfirmasi; no membawa SPPD checkbox.
- TDD remains Non-SPPD. Completed visits are read-only VIEW.
- Notifications are explicitly simulated locally; no real WhatsApp sends or deployments.
- No E-Notulen requirement or digital signatures in the new workflow.
- Preserve table layout, original room names, private PIC contacts, and existing records.

## Tasks

- [x] 1. Shared workflow state and transition rules: `Admin/VisitWorkflow.js`; tests `local-test/test/visit-workflow.test.js`. Enforce version, milestones, required files, recipient outcomes, valid booking, attendance, and signed completion. Test each invalid transition before implementing it.
- [x] 2. TLD eligibility: update `Tamu-Luar/Index.html`, `Tamu-Luar/Code.js`, fixtures and existing form tests. Ignore forged/stale checkbox values and create the initial SPPD record for every new TLD.
- [x] 3. Local adapter and RPC: `local-test/visit-workflow.js`, fixture handlers and server rendering/document routes. Keep actual uploads locally in memory, preserve reservations and attendance until restart, simulate recipient notifications with explicit outcomes. Test booking conflicts and attendance isolation.
- [x] 4. Modal: `Admin/VisitModal.html`, include in Index and expand in local harness. White card/green gradient; six tabs, visitor details/files, acknowledgement, uploads, notifications, reservation, attendance results, print/export, signed upload, and VIEW. Route Buku Tamu and matching Kendali SPPD links into this modal.
- [x] 5. GAS adapter: `Admin/VisitWorkflowStorage.js` with workflow JSON sidecar sheet, locked/versioned transitions, validated Drive attachments, real calendar/attendance links, and explicit unavailable notification provider until release configuration. Prevent legacy approval actions bypassing new workflow records.
- [x] 6. Integrate meeting attendance for outside visitors and selected agenda URLs; verify API flow, existing tests, HTML syntax, clasp file boundaries, local startup and browser rendering. No live GAS/Fonnte calls.

## Review focus

- Out-of-order/repeated requests and concurrent edits cannot advance status.
- Invalid or oversized documents cannot replace a valid attachment.
- Booking conflicts include internal meetings and visit agendas; attendance cannot cross visits.
- Unsigned export never claims physical signatures or completed approval.
- Closing/reopening, phone overflow, partial errors and completed VIEW remain usable.
