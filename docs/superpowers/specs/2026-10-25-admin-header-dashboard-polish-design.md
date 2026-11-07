# Admin Header and Dashboard Polish

## Intent

Update the Admin app identity and simplify its dashboard presentation without changing any data behavior, navigation tabs, or the standalone visitor applications.

## Approved design

- Replace the header landmark icon with the Batam city emblem from Wikimedia Commons, using its official 250-pixel thumbnail URL and `object-contain` sizing.
- Rename the browser and header identity to **SI-TARI DISKUM**.
- Use the description **Sistem Informasi Tamu & Rapat Internal Dinas Koperasi dan Usaha Mikro**.
- Remove only the header's Cloud Edition badge.
- Remove the Tamu Luar and Kiosk FO shortcuts from both desktop and mobile header areas; preserve the matching buttons inside the Buku Tamu feature.
- Keep the desktop and mobile clock/date displays.
- Remove hover-shadow highlighting from all four dashboard summary cards.
- Normalize all four primary summary values to the `text-2xl` size already used by Tipe Kedatangan.
- Change the Kunjungan Tamu Terbaru description to **Kunjungan terbaru yang tercatat** and its navigation label to **Semua**.

## Approach

Modify the existing HTML and Tailwind utility classes directly. This is preferred over adding CSS overrides because the requested behavior is entirely represented by current markup classes and direct edits keep the result easier to maintain.

## Non-goals

- Do not remove Cloud-related wording elsewhere in the SPPD feature or footer.
- Do not change the Buku Tamu feature buttons.
- Do not change backend behavior, fixtures, APIs, or standalone Tamu FO/Tamu Luar projects.
- Do not push or deploy to Google Apps Script as part of this local change.

## Approved follow-up: canonical tab titles

Use the same five titles in desktop and mobile navigation: **Dashboard**, **Buku Tamu**, **Jadwal Rapat**, **Kendali SPPD**, and **Lainnya**. Update mobile accessibility labels to match, but keep the existing icons, tab IDs, click handlers, page-section headings, and behavior.
