# SI-TARI workspace

Two active GAS apps share one backend and database:

| Directory | Purpose | Published version |
|---|---|---|
| `Admin/` | Dashboard, approvals, shared backend/library | 45 |
| `Public/` | Generated public TLD, TDD and Presensi app | 15; pinned Admin library 37 |

`Tamu-Luar/` and `Tamu-FO/` remain authoring sources for local tests and the public build. Do not deploy them independently. Former clasp configurations are archived under `deployments/2026-11-01/source-clasp-archive/`. Edit their HTML sources and `Admin/Presensi.html`, then rebuild Public.

Deployment IDs and versions: `deployments/2026-11-01/projects.json`. The former TDD deployment now shows a compatibility notice linking to the consolidated form; it performs no database writes. Historical standalone snapshots are retained.

## Public routes

Use the Public deployment's `/exec` URL with:

- No query, or `?page=tld`: external delegation registration.
- `?page=tdd`: local/front-office registration.
- `?page=presensi`: attendance; append `&id=AGENDA_ID` for an agenda QR link.

Admin stores `PUBLIC_FORMS_BASE_URL`, `TAMU_LUAR_URL` and `TAMU_FO_URL` in Script Properties. Links and new QR codes point to Public. The old TLD base URL remains valid; old Admin attendance links remain compatible during the demo.

## Build, test and deploy

From the workspace root (after bootstrapping local gitignored templates/data per [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md)):

```powershell
node local-test/setup-local.js --from-templates
node maintenance/build-public.js 30
node --test local-test/test/*.test.js
```

The argument is the immutable Admin library version. Published dependencies must not use development mode. Public exposes fixed registration and attendance wrappers only. Writes delegate to Admin and share its database properties and script lock. Library startup can add overhead; this consolidation does not guarantee a speed increase.

For the next release:

1. Back up sources, configurations and deployment snapshots.
2. Build/test for the intended next Admin version. Push `Admin/`, then create its immutable version with `clasp version`.
3. Rebuild Public using the actual version number. Check `clasp status`, then push and redeploy Public's existing deployment.
4. Verify public routes and live read-only data loading. Switch Admin's existing deployment with `clasp redeploy DEPLOYMENT_ID --versionNumber VERSION`.
5. Update the registry, snapshots and validation report. Do not reset or seed data as part of deployment.

Run `npx.cmd --yes @google/clasp` commands from the relevant active directory. Reuse deployment IDs to retain URLs. The one-time old-TDD notice is in `deployments/2026-11-01/legacy-tdd-notice/`; `maintenance/build-legacy-tdd.js` rebuilds it.

## Configuration and access

Admin owns the shared database and upload-folder Script Properties. Public uses the pinned `SiTariCore` library and does not discover or create a separate database. Public responses exclude admin workflow file URLs and PIC phone numbers.

Current open demo access is preserved as requested. Restrict Admin before official release, and replace old Admin attendance QR codes if those restrictions make them inaccessible. Keep public forms accessible. Store Fonnte tokens and other secrets in Script Properties, never source files.

## Rollback

Pre-migration backup: `backups/si-tari-before-two-project-migration_2026-11-01_192154.zip`.

Redeploy existing Admin to version 29, Public/former TLD to version 9, and former TDD to version 6 as a coordinated rollback. Restore previous Admin public-link Script Properties and local sources/configurations from the backup; redeploying code does not revert Script Properties.

Validation: `docs/validation/2026-11-01-two-project-migration.md`.

Admin Isi Presensi opens the protected Admin route `?page=presensi-admin`, with an editable 24-hour attendance time stored against the agenda date. Public QR attendance remains automatic. Individual AdminEntry records do not trigger the bulk manual-attendance QR lock.

Every calendar agenda offers Lihat Presensi, a read-only list of recorded names and attendance date/time (dd-mm-yyyy HH:mm WIB), including completed agendas.

Demo dataset refreshed 2 November 2026:20 visits covering every visitor status,12 agendas covering every meeting display status, and22 attendance records. Local preview matches GAS. Audit: maintenance/2026-11-02-reset/README.md.
