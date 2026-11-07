# Buku Tamu Revision

## Intent

Make the Buku Tamu tab describe both visitor intake routes clearly, reorganize its table around operationally useful information, and replace random visit codes with a human-readable monthly sequence shared by Tamu Luar Daerah and Tamu Dalam Daerah.

## Approved approach

Use the shared `Data_Tamu` sheet as the source for the next monthly serial. Each standalone Apps Script project reads existing new-format codes for the relevant visit month, finds the highest serial across both `TLD` and `TDD`, and adds one. This keeps both apps independent and requires no additional service.

The accepted tradeoff is that script locks are project-scoped: an outside visitor and FO visitor submitted at almost exactly the same time could rarely receive the same numeric serial. Their full IDs remain distinct because their prefixes differ. Same-project concurrent submissions remain protected by the existing script lock.

## Buku Tamu header

- Use the same `fa-users` icon as the Buku Tamu navigation tab.
- Change the box title to **Buku Tamu**.
- Change the description to **Kelola kunjungan melalui Form Tamu Luar Daerah dan Form Tamu Dalam Daerah.**
- Rename the buttons to **Form Tamu Luar Daerah** and **Form Tamu Dalam Daerah**.
- Preserve both existing click handlers and standalone destinations.

## Table structure

Use these seven column titles and matching mobile labels:

1. **ID & Waktu** — visit code, compact visit date, and unchanged time format.
2. **Asal Instansi / Pengunjung** — institution/visitor origin and address.
3. **Detail Tamu & Kontak** — lead visitor, group count, and WhatsApp contact.
4. **Bidang Tujuan & Agenda** — destination division and visit purpose.
5. **Penerima Tamu** — assigned receiving staff/LO.
6. **Status** — existing SPPD/non-SPPD status presentation.
7. **Aksi** — existing detail/SPPD action.

No record fields or table actions are removed; the change reorganizes their labels and presentation.

## Visit ID contract

- Tamu Luar Daerah prefix: `TLD`.
- Tamu Dalam Daerah prefix: `TDD`.
- Complete format: `<prefix>-<ddMMyyyy>-<serial>`.
- Examples: `TLD-25102026-001`, followed by `TDD-25102026-002` when both are in October 2026.
- The sequence is shared across both prefixes within the visit month and resets to `001` for a new visit month.
- The sequence uses the scheduled visit date. For FO, that is the current Jakarta date; for Tamu Luar, that is the submitted visit date.
- Serial numbers use at least three digits (`001`) and naturally expand beyond `999`.
- Existing legacy `TM-FO-*` and `TM-LUAR-*` records are not migrated and do not contribute to the new monthly sequence.
- Only codes matching `TLD-ddMMyyyy-serial` or `TDD-ddMMyyyy-serial` participate in the counter.

## Date display

In the Buku Tamu table, display the visit date as `ddMMyyyy`, for example `25102026`. Preserve the stored ISO date and current time formatting; this is a display-only date transformation.

## Safety and scope

- Keep the shared spreadsheet schema unchanged.
- Keep the independent FO and Tamu Luar deployments and submission flows unchanged apart from code generation.
- Keep current visitor details, staff assignment, SPPD creation, sorting, and actions unchanged.
- Keep all dummy data local-only and outside deployable projects.
- Do not migrate historical IDs.
- Do not push or deploy during local implementation.

## Approaches considered

1. **Shared-sheet calculation — selected.** Lowest complexity and preserves independent apps; accepts a rare cross-project simultaneous-serial race.
2. **Central ID allocator — deferred.** Guarantees strict ordering but adds an authenticated internal endpoint, configuration, and runtime dependency.
