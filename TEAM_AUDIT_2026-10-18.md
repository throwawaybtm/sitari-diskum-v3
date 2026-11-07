# SI-TAMU Current-State Audit

**Audit date:** 18 October 2026  
**Scope:** Admin app, Tamu FO, Tamu Luar, shared database, and current workflow  
**Purpose:** Team discussion for deciding what to keep, improve, replace, or remove

## Status legend

- ✅ Working or appropriate
- ⚠️ Works but needs improvement
- 🔴 Important problem
- 🗑️ Safe cleanup candidate
- ❌ Not implemented

## Top-to-bottom audit

### 1. Header and navigation

- ✅ SI-TAMU branding and current WIB clock/date.
- ✅ Direct links to Tamu Luar and Kiosk FO.
- ✅ Five desktop tabs and mobile bottom navigation.
- ⚠️ “Cloud Edition” and the long subtitle add visual noise for an internal admin tool.

### 2. Dashboard

- ✅ Displays visitors today, visitor type, meetings today, and SPPD status.
- ✅ Current order: KPI → latest visitors → today’s meetings.
- 🔴 The latest rollback restored realistic sample visitor rows.
- 🔴 A sample `allSppdData` array is also present in the front end.
- 🔴 When the database is empty or loading fails, sample information can appear as real data.
- **Recommendation:** Replace every sample record with loading, empty, and error states.

### 3. Buku Tamu

- ✅ Combines FO and Tamu Luar records in one table.
- ✅ Shows contact, destination, visit details, assigned LO, and SPPD indicator.
- ⚠️ No search, date filter, type filter, status filter, or visitor-detail view.
- ⚠️ No admin action to change the visitor’s status.
- ⚠️ New registrations are immediately marked **Diterima** instead of waiting for confirmation.
- ⚠️ WhatsApp numbers are visible, but there is no WhatsApp action or automation.

### 4. Shared Calendar

- ✅ Meeting list and scheduling form.
- ✅ Server-side room conflict protection.
- ✅ QR-based meeting attendance page.
- ⚠️ Room summary cards are hard-coded and can disagree with `Master_Ruangan`.
- ⚠️ A scanned meeting ID reaches the attendance page but does not preselect and lock the meeting.
- 🗑️ Two meeting-scheduling implementations exist; only `simpanJadwalRapat()` appears to be used.

### 5. SPPD control

- ✅ Three required evidence uploads: activity photo, attendance list, and minutes.
- ✅ Server-side sequence checks for technical approval followed by final approval.
- ✅ Status tracker and printable control sheet.
- 🔴 The approval buttons call missing browser functions:
  - `submitTtdTeknisAction()`
  - `submitTtdKasubagAction()`
- 🔴 Two approver roles and signer names remain hard-coded.
- 🔴 The current workflow conflicts with the plan to use one lead-assigned approval officer.
- ⚠️ The printed document resembles an official approval but is not a secure digital signature.

### 6. QR center

- ✅ Generates and prints QR cards for FO and Tamu Luar.
- ⚠️ QR generation depends on the external `api.qrserver.com` service.
- **Recommendation:** Later generate QR codes locally or through Apps Script.

### 7. Mobile interface

- ✅ Responsive header and mobile quick links.
- ✅ Five-button bottom navigation.
- ✅ Tables become card-style records on phones.
- ✅ Mobile-friendly dialogs are present.
- ⚠️ Records with many fields remain dense on small screens.

### 8. Standalone Tamu FO

- ✅ Public, write-only intake form connected to the shared database.
- ✅ Captures visitor, contact, destination, purpose, group, and optional SPPD data.
- ✅ Automatically assigns an LO.
- ⚠️ Records are immediately marked **Diterima**.
- ⚠️ No spam protection, rate limiting, or strong telephone-number validation.

### 9. Standalone Tamu Luar

- ✅ Uses styling consistent with the FO page.
- ✅ Supports scheduled visits, group data, official documents, WhatsApp contact, and optional SPPD.
- ✅ Stores submitted documents in Google Drive.
- ⚠️ No file-size limit or strong server-side file-type validation.
- ⚠️ The default browser date uses UTC and can be one day behind during early Jakarta hours.
- ⚠️ Records are immediately marked **Diterima** instead of pending confirmation.

### 10. Database and project structure

- ✅ Admin, Tamu FO, and Tamu Luar are separate clasp-ready Apps Script projects.
- ✅ Both guest forms connect to the main shared spreadsheet.
- ✅ Script locks protect simultaneous form submissions.
- ✅ Automatic sample-data population in the database remains removed.
- ✅ Admin deployment is restricted to the owner.
- ✅ Both guest forms allow anonymous access, as required for QR visitors.

### 11. Security and data integrity

- 🔴 Guest-submitted text is inserted into admin HTML without escaping, creating an HTML/script-injection risk.
- ⚠️ Admin-uploaded SPPD evidence is shared as **Anyone with the link**.
- ⚠️ `XFrameOptionsMode.ALLOWALL` permits the admin app to be embedded on other sites.
- 🔴 Approval identity is not derived from the signed-in administrator.
- ⚠️ There is no audit history for uploads, approvals, printing, or status changes.

### 12. Features not yet implemented

- ❌ Automatic WhatsApp notification.
- ❌ Visitor approval and rejection workflow.
- ❌ One configurable approval officer.
- ❌ Approval and activity history.
- ❌ Admin search and operational filters.

## Recommended implementation order

1. **Remove misleading data**
   - Delete static sample visitor rows.
   - Delete the sample `allSppdData` array.
   - Add honest loading, empty, and error states.

2. **Repair and simplify SPPD approval**
   - Fix the missing approval-button handlers.
   - Replace the two-role workflow with one configurable approver.
   - Record approver identity and approval time.

3. **Protect displayed and uploaded data**
   - Escape all database text before rendering it as HTML.
   - Add upload size and file-type validation.
   - Review Drive sharing and iframe permissions.

4. **Add the visitor workflow**
   - Suggested states: `Baru → Dikonfirmasi → Selesai` or `Ditolak`.
   - Add detail, confirm, reject, and complete actions to the admin app.

5. **Add WhatsApp integration**
   - Notify visitors only after confirmation.
   - Store delivery status and retry failures.

6. **Improve daily administration**
   - Add search and filters for date, type, destination, and status.
   - Add a focused visitor-detail view.
   - Preselect the correct meeting after scanning an attendance QR.

7. **Clean up the codebase**
   - Remove the unused meeting-scheduling implementation.
   - Remove unused iframe/presence helpers after confirming they have no callers.
   - Load room information from `Master_Ruangan` instead of hard-coded cards.

## Team decision checklist

- [ ] Keep or simplify the four dashboard KPI metrics?
- [ ] Keep automatic LO assignment or replace it with manual assignment?
- [ ] Should FO submissions require confirmation, or remain immediately accepted?
- [ ] Should Tamu Luar submissions start as `Baru` or `Menunggu Konfirmasi`?
- [ ] Who is the single SPPD/visitor approval officer?
- [ ] Which events should trigger WhatsApp messages?
- [ ] Should SPPD remain in this app or become a separate module later?
- [ ] Should uploaded documents be accessible only to the admin account?
- [ ] Which search and filters are essential for daily work?
- [ ] Which dashboard information can be removed completely?

## Suggested next small revision

Remove all sample records and implement genuine loading, empty, and error states. This is contained, low-risk, and prevents the admin interface from showing fictional records as operational data.

---

This audit is based on the source restored and deployed as Admin version **@32**. No application code or deployment was changed while preparing this document.
