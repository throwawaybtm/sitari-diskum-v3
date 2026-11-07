# SI-TAMU

SI-TAMU manages external visitor intake, visit confirmation, meeting schedules, attendance, and SPPD verification for the Dinas Koperasi dan Usaha Mikro Kota Batam.

## Applications

**Admin App**:
The private application used by the assigned administrator to review visits, manage meetings, and verify SPPD records.
_Avoid_: Main form, public admin

**Tamu FO**:
A walk-in visitor who is already present at the Front Office and performs a direct check-in.
_Avoid_: Booking, advance visitor

**Tamu Luar**:
A delegation or external visitor who submits a planned visit before arriving.
_Avoid_: Walk-in, FO visitor

## Visit workflow

**Permohonan Kunjungan**:
A planned visit submitted by Tamu Luar that is not accepted until the administrator confirms it.
_Avoid_: Booking, accepted visit, check-in

**Menunggu Konfirmasi**:
The initial state of a Permohonan Kunjungan before the administrator decides whether it can proceed.
_Avoid_: Diterima, approved

**Dikonfirmasi**:
A Permohonan Kunjungan that the administrator has accepted with an agreed schedule and staff assignment.
_Avoid_: Check-in, submitted

**Selesai**:
A confirmed visit that has taken place and requires no further visitor handling.
_Avoid_: Dikonfirmasi, closed request

**Ditolak**:
A Permohonan Kunjungan that the administrator has decided cannot proceed.
_Avoid_: Dibatalkan, pending

**Dibatalkan**:
A previously submitted or confirmed Permohonan Kunjungan that is withdrawn before completion.
_Avoid_: Ditolak, selesai

**Check-in FO**:
The direct registration of a Tamu FO who is already physically present; it does not require advance confirmation.
_Avoid_: Permohonan Kunjungan, booking

**Selesai FO**:
A Check-in FO that has finished and requires no further visitor handling.
_Avoid_: Sedang Dilayani, Dibatalkan

**Staf Tujuan**:
The team member selected by a Tamu FO as the person they want to meet. Only the FO form exposes this choice.
_Avoid_: Automatically assigned LO, approver

**Staf Diminta**:
The staff member originally selected by a Tamu FO, preserved even when the administrator later assigns someone else.
_Avoid_: Final assignment, assigned LO

**Staf Ditugaskan**:
The staff member finally assigned by the administrator to handle a visit.
_Avoid_: Visitor preference, automatic round-robin LO

**Penugasan Admin**:
The administrator's final assignment or correction of the staff member responsible for handling a visit; it remains distinct from the visitor's original Staf Tujuan selection.
_Avoid_: Round-robin LO, automatic workload assignment

**Bidang Tujuan**:
The organizational area selected by Tamu Luar to describe where a planned visit belongs; it is not a selection of an individual staff member.
_Avoid_: Staf Tujuan, assigned LO

## SPPD

**Kendali SPPD**:
The single evidence and verification record associated with one visit or delegation, retained as part of SI-TAMU.
_Avoid_: Digital signature, visitor approval

**Petugas Persetujuan**:
The single lead-assigned person authorized to verify SPPD records and perform the application's approval duties.
_Avoid_: Pejabat Teknis and Kasubag as separate application roles

**Verifikasi SPPD**:
The single approval action performed by the Petugas Persetujuan after all required evidence is complete, resulting in `Sah & Terverifikasi`.
_Avoid_: Two-stage signature, digital signature

**Siap Diverifikasi**:
A Kendali SPPD whose three required evidence files are complete but has not yet been verified by the Petugas Persetujuan.
_Avoid_: Sah & Terverifikasi, Belum Lengkap

**Perlu Perbaikan**:
A previously verified Kendali SPPD that has been formally reopened with a required reason and Catatan Audit.
_Avoid_: Silent overwrite, deleted verification

**Bukti SPPD**:
The activity photo, attendance list, and minutes uploaded privately by the administrator after a visit.
_Avoid_: Public visitor upload, initial visit documents

## Notifications

**Notifikasi WhatsApp**:
An automated message sent to Tamu Luar when a Permohonan Kunjungan is confirmed, changed, rejected, or cancelled.
_Avoid_: FO notification, internal staff notification

**Persetujuan Kontak**:
The visitor's recorded consent to receive visit-related communication through WhatsApp and to have the submitted contact data processed for that purpose.
_Avoid_: Marketing consent, implied consent

**Notifikasi Tertunda**:
A Notifikasi WhatsApp that could not be delivered and is waiting for another delivery attempt without reversing the underlying visit decision.
_Avoid_: Failed confirmation, cancelled visit

**Catatan Notifikasi**:
The delivery record for one outgoing Fonnte message, including its visit, purpose, provider reference, attempts, and delivery state.
_Avoid_: Visit status, audit entry

**Fonnte Gateway**:
The selected third-party WhatsApp Web gateway used to deliver Notifikasi WhatsApp for SI-TAMU.
_Avoid_: Meta Cloud API, official BSP

**Nomor WhatsApp Layanan**:
The organization-owned WhatsApp number connected to the Fonnte Gateway for visit notifications and ordinary human conversations.
_Avoid_: Administrator's personal number

**Tautan Pembatalan**:
A secure, visit-specific link shown after submission and repeated in confirmation messages so Tamu Luar can cancel without accessing the Admin App. It expires when the visit starts or reaches a terminal state.
_Avoid_: Admin login, cancellation by WhatsApp reply

**Konfirmasi Pembatalan**:
The explicit visitor action taken after reviewing visit details on the cancellation page; merely opening the link does not cancel the visit.
_Avoid_: Automatic GET cancellation, WhatsApp reply

**Alasan Penolakan**:
The required visitor-facing explanation recorded when a Permohonan Kunjungan is changed to `Ditolak`.
_Avoid_: Internal-only note, blank rejection

**Konfirmasi Kunjungan**:
The administrator's acceptance of a Permohonan Kunjungan with a final date, time, and assigned staff member.
_Avoid_: Approval without schedule, initial submission

## Visit documents and scheduling

**Surat Permohonan**:
The mandatory institutional visit-request document submitted with every Permohonan Kunjungan.
_Avoid_: Surat Tugas, optional attachment

**Surat Tugas**:
An optional delegation assignment document that may be submitted with a Permohonan Kunjungan.
_Avoid_: Surat Permohonan, required request document

**Jam Kunjungan**:
A future Monday-to-Friday time between 08:00 and 16:00 WIB, excluding configured holidays and office closures, when a Tamu Luar proposes to visit.
_Avoid_: Unrestricted date and time

**Dokumen Kunjungan**:
A PDF, JPG, or PNG Surat Permohonan or Surat Tugas file no larger than 5 MB.
_Avoid_: SPPD evidence, unrestricted attachment

**Duplikasi Permohonan**:
A second submission using the same WhatsApp number, visit date, and Bidang Tujuan within ten minutes of the first submission.
_Avoid_: Repeat visit on another date, corrected request after ten minutes

## Governance

**Catatan Audit**:
An append-only record of an administrative decision or sensitive action, including who acted and when.
_Avoid_: Editable activity note, application log

**Audit Log**:
The dedicated shared-database sheet containing immutable Catatan Audit entries.
_Avoid_: General application log, editable notes column

**Notification Log**:
The dedicated shared-database sheet containing Catatan Notifikasi entries independently of visit workflow state.
_Avoid_: Audit Log, visitor status column

**Release Gate**:
The point before real external visitors are allowed to submit personal data; before this gate, only controlled test data and non-sensitive documents may be used.
_Avoid_: Deployment, internal preview, arbitrary calendar date

**Migration Preview**:
A non-writing report of every proposed schema and status change that the administrator must review before an existing database is migrated.
_Avoid_: Automatic migration, backup

**Kebijakan Retensi**:
The organization-approved rule that determines how long visitor records and documents are kept; no automatic deletion occurs until this rule is established.
_Avoid_: Unreviewed automatic deletion period

**Benturan Staf**:
A warning that the staff member proposed for a Tamu Luar assignment already has another confirmed visit at the same time; the administrator may override it.
_Avoid_: Hard scheduling block, meeting-room conflict
