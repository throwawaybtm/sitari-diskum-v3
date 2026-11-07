# Buku Tamu visit workflow — design for review

Status: user clarified eligibility and attendance on 2026-10-27; proceeding with local implementation.

## Intent and scope

Replace the Buku Tamu EDIT button's existing direct SPPD-panel action with one visit modal containing KONFIRMASI, DISPOSISI, NOTIFIKASI, KEDATANGAN, SPPD, and SELESAI tabs. One assigned admin handles the workflow. Match the white cards, rounded corners, dark green/teal palette, gradient action buttons, spacing, and required-field markers of TLD, TDD, and Dashboard Presensi. Preserve the current table layout and small rounded sort chevrons.

Keep the existing six statuses and their ascending sort order:

1. Non-SPPD
2. Menunggu Konfirmasi
3. Sudah Disposisi
4. Menunggu Kedatangan
5. Kelola SPPD
6. Selesai

Non-SPPD retains a disabled grey action. Completed visits use VIEW and read-only review/download access to every tab and stored document.

## Approach

The user's selected interaction is one tabbed visit modal. Extend it with one shared workflow model consumed by the modal and backend so changing tabs cannot bypass prerequisite checks. The alternative of six separate modals would fragment the document history and is not recommended. Merely adding tabs to the old SPPD code would retain conflicting E-Notulen and digital-signature requirements.

Continue local-only testing: simulated notifications and local test documents; no real WhatsApp, GAS deployment, Sheets writes, or Drive uploads during testing. Production source changes must remain free of dummy records. Actual Fonnte activation remains a separate release task.

## Tab behavior and transitions

| Status when opened | Default tab | Content and action | Result |
|---|---|---|---|
| Menunggu Konfirmasi, not acknowledged | KONFIRMASI | Read-only visitor details, selected bidang/PICs, agenda, schedule, group members, and original uploaded documents; acknowledgement statement and large KONFIRMASI button | Store admin acknowledgement and timestamp. Status remains Menunggu Konfirmasi; DISPOSISI becomes available. |
| Menunggu Konfirmasi, acknowledged | DISPOSISI | Upload scanned surat disposisi; large SUDAH DISPOSISI button remains disabled without a successfully saved file | Store document and completion timestamp; status becomes Sudah Disposisi. |
| Sudah Disposisi | NOTIFIKASI | List every selected PIC; Kirim Notifikasi button and per-recipient results; then room, date, start and end fields using the internal-meeting room choices | Only after all required notifications succeed and a valid room reservation is saved, status becomes Menunggu Kedatangan. |
| Menunggu Kedatangan | KEDATANGAN | Show attendance belonging to this visit, followed by large VALIDASI button | Persist arrival validation; status becomes Kelola SPPD. Attendance source requires clarification below. |
| Kelola SPPD, evidence not yet validated | SPPD | Existing Foto Kegiatan and Daftar Hadir evidence, without E-Notulen upload or requirement; large VALIDASI/export action | Validate evidence and generate Surat Pengesahan SPPD for physical signatures. Status remains Kelola SPPD; SELESAI tab becomes available. |
| Kelola SPPD, unsigned document exported | SELESAI | Upload signed Surat Pengesahan; large SELESAI button stays disabled until the upload succeeds | On SELESAI, mark visit Selesai, close modal, and replace EDIT with VIEW. |
| Selesai | Read-only review | All six tabs and their files are available for viewing and downloading | No further mutations through VIEW. |

For the final phase, “Selesai” is the tab name before completion and the status only after the signed document is uploaded and the SELESAI button succeeds.

## Builder proposals

- Previous tabs remain readable. Future tabs stay locked until their prerequisites pass. Opening EDIT resumes the next unfinished step; manually switching tabs never advances status.
- Acknowledgement, evidence validation/export, and signed upload are separate saved milestones even when the public status does not change.
- Preserve recorded PIC assignments. Notify every PIC selected for the visit, using private directory contacts on the backend. Do not publish the contact directory to public forms.
- Display local notification results explicitly as simulations. In production distinguish provider acceptance from actual delivery; failed or partial attempts do not unlock the next status. Retry failed recipients without automatically resending successful recipients.
- Room reservations require date, start/end time, capacity, and conflict checks against both internal meetings and other visit reservations. Reserve once per visit, with server-side rechecking; failed booking leaves the visit at Sudah Disposisi.
- Reuse the current PDF/photo format rules and 5 MB per-file limit for new scanned documents. Keep successful uploads on validation failure; a failed replacement must not discard the previous valid file.
- Export the unsigned pengesahan as a printable document with physical signature spaces, without the old “Sah & Terverifikasi” digital approval stamp. The exact official template/signatory details need verification before release; local testing can use a clearly labelled draft based on the existing print layout.
- Keep existing E-Notulen documents accessible as historical attachments, while removing their upload requirement from the new workflow. Old digital approval endpoints must not bypass the new completion rules.
- Save milestone timestamps and actor, and validate transitions on the backend. Reject stale/out-of-order requests and duplicate transitions. Disabling a UI button is not sufficient enforcement.
- Retain historical statuses and files; no inferred date-based advancement or bulk migration of existing visits. New eligible TLD submissions begin at Menunggu Konfirmasi.
- Modal supports keyboard dismissal/focus handling, small phone screens, scrollable tabs, upload progress/errors, and disabled buttons during saves.

## Data and implementation boundaries

Current code stores visit status in Data_Tamu and evidence in Kendali_SPPD. It has no persisted visit acknowledgement, disposisi, notification outcomes, visit-linked room reservation, signed pengesahan, or visit-specific attendance workflow. Add explicit records for these milestones without changing the meaning or indexes of existing columns. Keep business transition rules separate from storage and UI code so local tests and GAS enforce the same rules.

The local harness currently resets in-memory data on restart. Preserve that established behavior unless the user asks for persistent local test storage. Server changes and test data remain outside clasp application roots.

After the open decisions are settled, implement and validate in this order:

1. Workflow model, guarded transitions, local fixtures covering every stage, and modal shell.
2. KONFIRMASI and DISPOSISI, including document storage and resume behavior.
3. NOTIFIKASI and room reservations with shared conflict checking.
4. Visit-linked attendance and KEDATANGAN validation.
5. SPPD evidence, unsigned export, signed upload, completion, and read-only VIEW.
6. Integration checks across new TLD submissions, table status/sorting, existing SPPD screens, phone layout, and document downloads.

Each phase should be usable locally before moving on; no deployment is included.

## User decisions

1. Every new TLD enters the workflow at Menunggu Konfirmasi. Remove the membawa SPPD checkbox and ignore client values for it. TDD remains Non-SPPD and greyed out.
2. Visit room reservations appear in Jadwal Rapat. Guests access the existing attendance form through that agenda's QR. KEDATANGAN only displays attendance linked to that reserved agenda; the admin validates it after the visit.

## Verification criteria

- Exact status order, distinct badge colours, correct default tab at each milestone, and disabled Non-SPPD actions.
- KONFIRMASI never changes the public status. No disposisi advancement without acknowledgement and valid stored scan.
- All selected PIC notification outcomes and room reservations are linked to the correct visit; partial failures and room conflicts cannot advance status.
- Arrival validation uses only that visit's attendance. It cannot consume attendance from another internal meeting or visit.
- SPPD requires Foto Kegiatan and Daftar Hadir, not E-Notulen. Export is available before physical signing, without marking the visit complete.
- SELESAI requires the saved signed document; completion closes the modal and makes all stages read-only through VIEW.
- Refresh/resume, repeated clicks, stale saves, failed uploads, multi-PIC visits, original file links, and existing historical records are covered.
- No live service calls or real WhatsApp sends during local testing, and no dummy data included in clasp uploads.
