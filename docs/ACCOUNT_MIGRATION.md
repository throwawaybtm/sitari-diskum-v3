# Moving SITARI to another Gmail account

This runbook moves the whole live SITARI setup from the current owner's Gmail account (**old account**) to another Gmail account (**new account**). Both are personal Gmail accounts, not Google Workspace.

Only the owner performs these steps. Agents may help prepare and check, but the hard stops in `CLAUDE.md` still apply: no clasp, no live Sheets/Drive/Fonnte changes and no deploys without the owner's explicit approval.

## What moves

| Item | What it is |
|---|---|
| **Admin** Apps Script project | The dashboard, the backend, and the `SiTariCore` library |
| **Public** Apps Script project | The TLD, TDD and Presensi forms. It calls `SiTariCore` at a pinned version. |
| `DB_SI_TAMU_DISKUM_BATAM` | The shared database spreadsheet |
| Drive folder `SI-TAMU DISKUM KOTA BATAM`, with its letters (`FOLDER_SURAT_ID`) and evidence (`FOLDER_BUKTI_ID`) subfolders | Every uploaded letter, SPPD evidence file and meeting photo |
| Admin Script Properties | `SPREADSHEET_ID`, `FOLDER_SURAT_ID`, `FOLDER_BUKTI_ID`, `APPROVER_EMAIL`, `APPROVER_NAME`, `FONNTE_TOKEN`, `FONNTE_DISABLED`, `ADMIN_DEMO_MODE`, `PUBLIC_DEV_MODE`, `PUBLIC_FORMS_BASE_URL`, `TAMU_LUAR_URL`, `TAMU_FO_URL` |
| Fonnte | Not a Google service. The token keeps working whichever account runs the script. |

`Data_Tamu` and the SPPD records store **direct Drive links** to uploaded files. Those links only keep working if the files keep their IDs, so ownership is **transferred**, never copied.

## Choose a path

- **Path A, recommended: transfer ownership** of everything, including both Apps Script projects. Script IDs, deployment IDs, the spreadsheet ID and every file ID stay the same. So the `/exec` links, the printed attendance QR codes, the Script Properties and the stored file links should all keep working.
- **Path B, fallback: new projects in the new account.** Use it only if Path A's rehearsal fails. Every `/exec` link and QR code changes; see [Path B](#path-b-new-projects-new-links).

## Before you start

1. **Approval.** This moves visitors' and staff's personal data to another account. Get the Dinas's agreement in writing. Also agree who the admin is from now on.
2. **Release first.** Finish any pending release from the old account, so the move starts from a known-good version. Note the live versions: Admin version, Public version, and Public's pinned `SiTariCore` version.
3. **Backups**, saved somewhere private and never in this repo:
   - The database: File → Download → Microsoft Excel (`.xlsx`).
   - Both projects: on the PC, run `clasp pull` into a fresh, empty folder for each project. Don't run it in your working copy.
   - Every Script Property name and value: Admin → ⚙️ Project Settings → Script Properties.
4. **Triggers.** In both projects, open ⏰ Triggers and write down any triggers listed. Triggers belong to the user who created them and **do not move** with the project.
5. **The new account**, prepared:
   - Settings → time zone **(GMT+07:00) Western Indonesia Time**.
   - Signed in on the PC: run `npx @google/clasp logout`, then `npx @google/clasp login` and choose the new account.
6. **A quiet time window.** Pick a time with no meetings or expected visitors. Nothing breaks during the move, but you'll test with real forms.

## The WhatsApp and admin switches (read before moving)

`Admin/VisitWorkflowStorage.js` holds `PUBLIC_DEV_ENV_CONFIG_`, a hard-coded "public dev mode". It counts as on only when three things all hold:
- the script ID matches,
- the spreadsheet ID matches,
- the effective user is **the old account's email**.

While it's on, it does two things:
- **It turns off Fonnte.** See `isFonnteDisabled_` in `Admin/VisitNotifications.js`.
- **It opens the Admin dashboard.** See `requireVisitAdmin_`.

Once the new account deploys, the effective user changes and dev mode switches **off** by itself. Then:

1. **WhatsApp starts sending for real**, unless the Script Property `FONNTE_DISABLED` is `true`. Set `FONNTE_DISABLED` = `true` **before** the new account deploys anything. Remove it only when the Dinas has decided to go live with notifications.
2. **The Admin dashboard falls back to `ADMIN_DEMO_MODE` and `APPROVER_EMAIL`.**
   - `ADMIN_DEMO_MODE` = `true` keeps the dashboard open to anyone with the link.
   - With it unset or `false`, only emails in `APPROVER_EMAIL` get in.

   For personal Gmail web apps, Google often hides a visitor's email from the script. Expect only the deploying account (the new account) to be recognised, and test this in [step 6](#path-a-step-by-step).

Recommended for the move:
- `FONNTE_DISABLED` = `true`.
- Keep `ADMIN_DEMO_MODE` exactly as it is today, so behaviour doesn't change during the move.
- Restricting the dashboard is its own change afterwards ([after the move](#after-the-move)).

## Rehearsal (do this first, about 15 minutes)

Path A depends on Google keeping a web app's deployment, and its URL, when a script changes owner. Check that with a throwaway project before touching SITARI:

1. **Old account:** create a new standalone Apps Script project with:

   ```js
   function doGet() {
     return HtmlService.createHtmlOutput('Owner: ' + Session.getEffectiveUser().getEmail());
   }
   ```

   Deploy it as a web app (Execute as **Me**, access **Anyone**) and note its URL.
2. **Transfer:** in Drive, find the project → Share → add the new account as **Editor** → change their role to **Transfer ownership**. Then, signed in as the new account, accept the transfer (email, or Drive → Shared with me).
3. **New account:** open the project → Deploy → **Manage deployments** → edit (pencil) the existing deployment → Version: **New version** → Deploy. Authorise when asked.
4. **Check:** open the **same** URL from step 1. It must load and show the **new account's** email.

If step 4 works, use Path A. If the URL changed, the deployment disappeared, or it still runs as the old account, stop and use Path B. Delete the test project either way.

## Path A, step by step

### 1. Prepare (old account)

1. Admin → Script Properties: set `FONNTE_DISABLED` = `true` (see above).
2. Give the new account **Editor** access to:
   - the Admin project,
   - the Public project,
   - `DB_SI_TAMU_DISKUM_BATAM`,
   - the `SI-TAMU DISKUM KOTA BATAM` folder.

   Sharing the folder shares everything inside it.

### 2. Transfer the data (old account)

1. **Spreadsheet:** Share → the new account → **Transfer ownership**.
2. **Folders and files:** ownership of a folder does **not** carry over to the files inside it, so transfer the files too.
   - Open each folder: the root, the letters folder and the evidence folder, plus any subfolders.
   - Select all its files (Ctrl+A) → Share → the new account → Transfer ownership.
   - Then transfer the folder itself, the same way.
3. **New account:** accept every pending transfer (email, or Drive → Shared with me).
4. **Check from the new account:**
   - In Drive, filter the folder by **Owner: me**. Every file should be listed.
   - The spreadsheet shows the new account as owner.

   The IDs haven't changed, so `SPREADSHEET_ID`, `FOLDER_SURAT_ID` and `FOLDER_BUKTI_ID` stay as they are.

### 3. Transfer the scripts (old account)

1. Transfer ownership of the **Admin** project, then the **Public** project: in Drive, find each project → Share → Transfer ownership.
2. **New account:** accept both transfers.

### 4. Redeploy Admin as the new account

1. **Before you deploy:** sign in to the Admin project as the new account and open Script Properties. Confirm:
   - every property from your backup is still there,
   - `FONNTE_DISABLED` = `true`,
   - set `APPROVER_EMAIL` to the new admin email,
   - set `APPROVER_NAME` to the new admin's name.
2. Recreate the triggers you noted in [Before you start](#before-you-start), signed in as the new account.
3. Deploy → **Manage deployments** → edit the **existing** web app deployment → Version: **New version** → Deploy. Authorise Sheets, Drive and external requests when asked.

   Always edit the existing deployment. A new deployment would get a new URL.
4. Note the new Admin version number.

### 5. Redeploy Public as the new account

1. Public → Libraries (left panel) → **SiTariCore** → set the version to the Admin version from step 4 → Save. If you release from the PC instead, run `node maintenance/build-public.js <Admin version>` and `clasp push` from `Public/`.
2. Deploy → **Manage deployments** → edit the **existing** deployment → New version → Deploy. Authorise when asked.

### 6. Test (new account and a private browser window)

| Check | Expected |
|---|---|
| Admin URL (unchanged) | Loads, with data, as before |
| Admin as a different account, or signed out | Matches the `ADMIN_DEMO_MODE` / `APPROVER_EMAIL` setting you chose |
| `?page=tld` with two files | Registration succeeds, and both files land in the letters folder, **owned by the new account** |
| `?page=tdd` | Check-in succeeds |
| Attendance QR (`?page=presensi&id=…`) on a test agenda | Saves |
| An **old** visit in Buku Tamu → open its Surat Permohonan | The file opens. This proves the transferred IDs kept the stored links working. |
| E‑Notula PDF and a Kendali SPPD evidence upload on a test record | Work |
| Executions (both projects) | No errors, and runs are by the new account |
| Fonnte dashboard | **No** messages sent during the test |

Delete or cancel the test records afterwards.

### 7. Hand over and tidy up

1. On the PC, the `.clasp.json` script IDs are unchanged in Path A. Run `npx @google/clasp status` in `Admin/` and `Public/` as the new account to confirm clasp can reach both projects.
2. Keep the old account as **Editor** for about two weeks, as a safety net. Then remove it from:
   - both projects,
   - the spreadsheet,
   - the root folder.
3. Update this repo in a pull request:
   - `README.md` and `deployments/2026-11-01/projects.json`: the new versions.
   - `PUBLIC_DEV_ENV_CONFIG_` in `Admin/VisitWorkflowStorage.js`: it still names the old account. Either set `enabled: false` (production behaviour) or point it at the new account (personal dev mode again). Release that change like any other Admin change.

## After the move

- **Notifications:** remove `FONNTE_DISABLED` (or set it to `false`) only when the Dinas decides to send real WhatsApp messages. Then test with a staff number first.
- **Admin access:** set `ADMIN_DEMO_MODE` to `false` and make sure `APPROVER_EMAIL` holds the admin account, then redeploy Admin. Re-test that Admin rejects other accounts and that the public forms still work anonymously.
- **Open item:** uploaded TLD letters are shared as "anyone with the link". This is tracked separately; the move doesn't change it.

## Rollback

- **During the move:** if anything fails before step 4, the old account still owns the scripts. Just stop.
- **After the scripts are transferred:** the new account transfers the Admin and Public projects back to the old account. The old account then edits each existing deployment to its previous version: Admin first, then Public's `SiTariCore` pin and Public.
- **Data:** the transferred files and spreadsheet can be transferred back the same way. Nothing is deleted at any point in this runbook.

## Path B: new projects, new links

Use this only if the rehearsal shows that ownership transfer loses the deployment or its URL.

1. **Data:** transfer the spreadsheet and files exactly as in [Path A step 2](#2-transfer-the-data-old-account). This keeps every ID and stored link.
2. **Admin project:**
   - As the new account, on the PC, create the Admin project with `npx @google/clasp create --type standalone --title "SI-TARI Admin"`, in a fresh folder.
   - Copy its script ID into `Admin/.clasp.json`, then `clasp push` from `Admin/`.
3. **Admin settings and release:**
   - Enter every Script Property from your backup, with `FONNTE_DISABLED` = `true`.
   - Create a version.
   - Deploy as a web app: Execute as **Me**, with access as today.
4. **Public project:**
   - Create the Public project the same way and put its ID in `Public/.clasp.json`.
   - Run `node maintenance/build-public.js <Admin version>`. It reads the new library ID from `Admin/.clasp.json`.
   - `clasp push` from `Public/` and deploy (Execute as **Me**, access **Anyone**).
5. **Links:** in Admin's Script Properties, set:
   - `PUBLIC_FORMS_BASE_URL` to the new Public `/exec` URL,
   - `TAMU_LUAR_URL` to `<that URL>?page=tld`,
   - `TAMU_FO_URL` to `<that URL>?page=tdd`.
6. **Test** as in [Path A step 6](#6-test-new-account-and-a-private-browser-window).
7. **Replace every old link:**
   - Regenerate and reprint the attendance QR codes.
   - Update posters, websites and WhatsApp templates that carry the form link.
8. **Old deployments:** in the old account, change the old projects to show a "moved to a new address" notice instead of switching them off. `maintenance/build-legacy-tdd.js` is the pattern to copy.
9. **Repo:** commit the new `.clasp.json` IDs and update `README.md`, `deployments/2026-11-01/projects.json` and `PUBLIC_DEV_ENV_CONFIG_` (see [step 7](#7-hand-over-and-tidy-up)).
