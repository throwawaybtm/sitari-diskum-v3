# Simplified TDD revision — implemented scope

User correction: keep the existing form and change its naming and choices. Remove member-name entry, retain Total Orang, and omit date/time inputs, file upload, and the SPPD checkbox.

Preserve current max-w-lg layout, field order, existing background/button styling, and institution/address optionality. Rename the header to “Pendaftaran Kunjungan Tamu Dalam Daerah”, description to “Silakan lengkapi data kunjungan”, labels to Nama Pengunjung, Total Orang, Nama Instansi / Asal Pengunjung, WhatsApp Narahubung, Alamat Instansi / Domisili, Bidang Tujuan, and Agenda. Submit: “Kirim Pendaftaran Kunjungan”.

Use the nine TLD destination/PIC mappings, checkboxes for one or more destinations, and PIC names inside the cards. Tamu-FO/Destinations.js is server-only and parity-tested against TLD. Public templates/responses omit PIC phone numbers. Existing form width is retained, so long destination names can wrap inside equal-width cards.

Required data remains visitor name, WhatsApp, agenda, a positive integer Total Orang, and at least one recognized destination. Do not require institution/address or add member details. Save automatic server-side Jakarta arrival time, blank member/upload columns, and Non-SPPD (0). Ignore client attempts to supply removed fields or force SPPD. Preserve TDD shared monthly numbering, shared sheet columns, and old records.

Local registration uses the same directory/validation and reflects all selected recipients in Admin. Added network failure recovery to the existing submit handler. No GAS push or WA sending.

Backup: `backups/tdd-before-form-revision_2026-10-26_203348.zip`.
Verification: 35 passing tests plus syntax checks. Tests cover full directory parity, private contact exclusion, required data and recognized choices, deduplication, GAS row persistence, no SPPD row creation, ignored member/date/SPPD client fields, and local submissions reflected in Admin. Existing TLD and monthly rollover checks also pass.

Local server restarted on port 4173 (PID 28604), and the existing VS Code TDD preview was refreshed and visually checked. Institution/WhatsApp inputs retain their existing two-column layout with bottom alignment to accommodate longer labels.

Follow-up layout revision: match TLD's content-fitting page width (860px base maximum, intrinsic equal-width Bidang columns on desktop), place Nama Pengunjung and Total Orang together in a 2:1 row, use consistent section spacing and aligned institution/WhatsApp fields, and retain single-column phone layout. Verified with the three TDD tests and the refreshed desktop preview. This overrides the original max-w-lg requirement above.
