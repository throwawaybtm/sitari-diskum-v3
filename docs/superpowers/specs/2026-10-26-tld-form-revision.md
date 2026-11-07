# TLD form revision

User request: rename the page and fields, replace two destination categories with the nine supplied destinations and fixed PICs, allow multiple selections, keep PIC phones backstage for future WhatsApp messaging, show PDF/photo upload limits, align the contact field, and use the agreed gradient submit button without “Online”.

Implementation decisions: render destination/PIC names from a server-side directory and keep phone numbers out of HTML and API responses. Store the selected destinations, directory IDs, and PICs as semicolon-separated values in the existing Data_Tamu columns (no schema migration). TLD now uses the supplied fixed PICs instead of round-robin selection. TDD stays on its existing flow.

Required fields carry a red asterisk after the label, with “* Wajib diisi” above the form. Per the follow-up request, all data fields and both files are mandatory, including address, member list, date, and time. Select at least one destination. A solo visitor enters their own name in the member list. The SPPD checkbox remains a yes/no declaration and can be unchecked. Allow PDF, JPEG, PNG, WebP, HEIC/HEIF up to 5 MiB per file, enforced in browser and backend. Local registration permits a 15 MiB JSON body for two base64 uploads and discards file contents.

Admin renders multiple destinations as separate coloured badges and lists the corresponding receiver names on separate lines. No automated WA sending is added in this revision. No clasp push or deployment is performed.
