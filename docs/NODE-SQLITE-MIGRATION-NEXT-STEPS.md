# Node + SQLite Migration Next Steps

Updated: 2026-05-10 CST

This document tracks the remaining work after the Node/SQLite runtime, VPS shell, D1 access, and R2 read-only credentials are ready.

## Current State

- Local branch: `codex/node-sqlite-migration`.
- Local Wrangler auth: ready under `.wrangler-home`.
- D1 database: `exhibition_db`.
- R2 bucket: `expo-contracts`.
- R2 S3 credential file: `.env.r2.local`, gitignored, mode `600`.
- VPS: `8.136.49.187`, Node/PM2/nginx/cron are running with migrated D1 data in SQLite.
- R2 dry run: passed, `54` objects, `91,219,220` bytes, `0` failed keys.
- Production D1 row counts are recorded in `docs/NODE-SQLITE-MIGRATION-PLAN.md`.
- Phase A D1 migration: completed on `2026-05-10 21:39 CST`.

Do not commit `.env.r2.local`, exported D1 dumps, production SQLite files, or downloaded object files.

## Goal

Finish the production migration from Cloudflare D1/R2 to the Aliyun VPS Node + SQLite + local filesystem runtime, with row-count/object-count verification, backup/restore proof, and user-facing workflow checks.

## Phase A: D1 Data Migration

### A1. Preflight

Inputs:

- Confirm the production `ERP_CONFIG_SECRET`. If D1 has existing encrypted ERP config rows, the VPS must use the old production secret before importing data.
- Confirm a short maintenance window. The app can keep serving Cloudflare until final cutover, but data should not change during the final export/import.
- Confirm whether the historical tables should be archived only:
  - `Project_Accounts`
  - `Project_Industries`
  - `Project_Prices`
  - `Project_Staff_Map`

Current code search found no runtime references to those four tables. Recommendation: archive them in the D1 dump, but do not import them into Node SQLite unless a real workflow still needs them.

### A2. Export Production D1 Data

Create a local migration workspace:

```sh
mkdir -p .tmp/migration
```

Export the full D1 database for archive:

```sh
HOME=$PWD/.wrangler-home npx wrangler d1 export exhibition_db --remote \
  --output .tmp/migration/d1-full-archive.sql
```

Export only the tables present in `db/init-sqlite.sql` for Node import:

```sh
HOME=$PWD/.wrangler-home npx wrangler d1 export exhibition_db --remote --no-schema \
  --table Accounts \
  --table Agents \
  --table BoothLocks \
  --table BoothMapItems \
  --table BoothMaps \
  --table Booths \
  --table ExhibitionConfirmationSettings \
  --table ExhibitionLintels \
  --table ExhibitionRefrigeratorConfigs \
  --table ExhibitionRefrigeratorRentalItems \
  --table ExhibitionRefrigeratorRentals \
  --table ExhibitionSpecialDecorationReports \
  --table ExhibitorConfirmationEvents \
  --table ExhibitorConfirmationLinks \
  --table Expenses \
  --table Industries \
  --table LoginAttempts \
  --table OrderBoothChanges \
  --table OrderOverpaymentIssues \
  --table Orders \
  --table Payments \
  --table Prices \
  --table ProjectErpConfigs \
  --table ProjectOrderFieldSettings \
  --table ProjectOrderReleaseSettings \
  --table Projects \
  --table Staff \
  --table WriteRateLimits \
  --output .tmp/migration/d1-node-data.sql
```

Acceptance:

- Both export files exist.
- `d1-node-data.sql` contains only tables that exist in `db/init-sqlite.sql`.
- No secrets are copied into Git-tracked files.

### A3. Local Import Rehearsal

Create a fresh local SQLite file and import the Node table dump:

```sh
rm -f .tmp/migration/rehearsal.sqlite
sqlite3 .tmp/migration/rehearsal.sqlite < db/init-sqlite.sql
sqlite3 .tmp/migration/rehearsal.sqlite < .tmp/migration/d1-node-data.sql
sqlite3 .tmp/migration/rehearsal.sqlite "PRAGMA integrity_check;"
```

Compare row counts against `docs/NODE-SQLITE-MIGRATION-PLAN.md`.

Acceptance:

- `PRAGMA integrity_check` returns `ok`.
- All 28 Node app table counts match the recorded D1 counts.
- Spot checks for login/staff/order/payment/project rows look sane.

### A4. Server Import

Before replacing the VPS DB, take a backup:

```sh
ssh admin@8.136.49.187 'BACKUP_ENV_FILE=/opt/expo-server/.env.production bash /opt/expo-server/scripts/backup-sqlite.sh'
```

Transfer the import SQL:

```sh
scp .tmp/migration/d1-node-data.sql admin@8.136.49.187:/opt/expo-server/data/d1-node-data.sql
```

On the VPS, stop the app briefly, recreate the DB, import, verify, and restart:

```sh
ssh admin@8.136.49.187 '
  set -e
  pm2 stop expo-server
  cp /opt/expo-server/data/exhibition.sqlite /opt/expo-server/data/exhibition.sqlite.before-d1-import
  rm -f /opt/expo-server/data/exhibition.sqlite /opt/expo-server/data/exhibition.sqlite-wal /opt/expo-server/data/exhibition.sqlite-shm
  sqlite3 /opt/expo-server/data/exhibition.sqlite < /opt/expo-server/db/init-sqlite.sql
  sqlite3 /opt/expo-server/data/exhibition.sqlite < /opt/expo-server/data/d1-node-data.sql
  sqlite3 /opt/expo-server/data/exhibition.sqlite "PRAGMA integrity_check;"
  pm2 start expo-server
  pm2 status expo-server --no-color
'
```

Acceptance:

- VPS SQLite integrity check returns `ok`.
- VPS row counts match D1 baseline.
- `pm2 status expo-server` is online.
- `POST /api/login` returns a business response, not a runtime 500.

### Phase A Completion Record - 2026-05-10 21:39 CST

Completed:

- Confirmed `/opt/expo-server/.env.production` contains `ERP_CONFIG_SECRET`.
- Exported full D1 archive to `.tmp/migration/d1-full-archive.sql`.
- Exported Node table data to `.tmp/migration/d1-node-data.sql`.
- Archived-only historical tables were left out of the Node import:
  - `Project_Accounts`
  - `Project_Industries`
  - `Project_Prices`
  - `Project_Staff_Map`
- Updated `db/init-sqlite.sql` for production D1 compatibility columns found during rehearsal:
  - `Projects.status`
  - `Staff.target_booths`
  - `Staff.token`
  - `Orders.extra_rentals`
  - `Orders.fascia_name`
  - `Orders.fascia_count`
  - `Payments.created_at`
  - `Payments.project_id` is nullable to preserve three historical payment rows.
- Local rehearsal imported into `.tmp/migration/rehearsal.sqlite`.
- VPS pre-import backup completed:
  - `/var/backups/expo-server/20260510-213840/manifest.txt`
- VPS pre-import DB copy:
  - `/opt/expo-server/data/exhibition.sqlite.before-d1-import-20260510-213857`
- Transferred the updated `db/init-sqlite.sql` and `.tmp/migration/d1-node-data.sql` to the VPS before import.
- Recreated `/opt/expo-server/data/exhibition.sqlite` and imported D1 data.
- Removed the temporary `__migration_probe__` login-attempt row created by the login smoke test.

Verification:

- Local `PRAGMA integrity_check`: `ok`.
- VPS `PRAGMA integrity_check`: `ok`.
- Local and VPS row counts match the D1 baseline for all 28 Node app tables:
  - `Accounts=0`, `Agents=14`, `BoothLocks=0`, `BoothMapItems=465`, `BoothMaps=2`, `Booths=465`
  - `ExhibitionConfirmationSettings=1`, `ExhibitionLintels=3`, `ExhibitionRefrigeratorConfigs=3`, `ExhibitionRefrigeratorRentalItems=0`, `ExhibitionRefrigeratorRentals=0`, `ExhibitionSpecialDecorationReports=2`
  - `ExhibitorConfirmationEvents=1`, `ExhibitorConfirmationLinks=12`, `Expenses=0`, `Industries=6`, `LoginAttempts=11`
  - `OrderBoothChanges=15`, `OrderOverpaymentIssues=2`, `Orders=104`, `Payments=65`, `Prices=3`
  - `ProjectErpConfigs=1`, `ProjectOrderFieldSettings=14`, `ProjectOrderReleaseSettings=1`, `Projects=1`, `Staff=25`, `WriteRateLimits=15`
- Spot check: `Staff=25`, sane `Orders=104`, sane `Payments=65`, first project is `2026福州渔博会`.
- `pm2 status expo-server --no-color`: `online`.
- `POST http://8.136.49.187/api/login` with an invalid probe account returned business `401` JSON, not runtime `500`.
- `pm2 logs expo-server --lines 30 --nostream --no-color`: no error-log lines in the checked tail.
- `npm test`: passed locally after the schema compatibility update.

## Phase B: R2 Object Migration

### B1. Real Object Download

Recommended: run the migration on the VPS so files land directly in `/var/expo-files`.

First transfer the R2 env file securely:

```sh
scp .env.r2.local admin@8.136.49.187:/opt/expo-server/.env.r2.local
ssh admin@8.136.49.187 'chmod 600 /opt/expo-server/.env.r2.local'
```

Run migration:

```sh
ssh admin@8.136.49.187 '
  cd /opt/expo-server
  FILE_STORAGE_ROOT=/var/expo-files npm run migrate:r2:local -- \
    --env-file /opt/expo-server/.env.r2.local \
    --bucket expo-contracts \
    --summary /opt/expo-server/r2-migration-summary.json \
    --sample-size 5
'
```

Acceptance:

- Summary `listedCount` is `54`.
- Summary `failedKeys` is empty.
- Local object count is `54`.
- Sample verification passes.

### B2. File Serving Checks

After R2 migration and D1 import:

- Contract upload, preview, and download.
- Booth map background preview/final view.
- Refrigerator image paths, if any are present.
- Public confirmation banner path, if configured.

Acceptance:

- Existing migrated files open through app routes.
- Newly uploaded files are saved under `/var/expo-files`.
- A post-migration backup includes both SQLite and `/var/expo-files`.

### Phase B Completion Record - 2026-05-10 21:44 CST

Completed:

- Copied `.env.r2.local` to `/opt/expo-server/.env.r2.local` and set mode `600`.
- Copied the missing R2 migration runner to `/opt/expo-server/scripts/migrate-r2-to-local.mjs` and refreshed remote `package.json` / `package-lock.json` so `npm run migrate:r2:local` is available.
- Ran the real R2 download on the VPS with `FILE_STORAGE_ROOT=/var/expo-files`.
- Wrote migration summary to `/opt/expo-server/r2-migration-summary.json`.
- Ran a post-migration backup:
  - `/var/backups/expo-server/20260510-214406/manifest.txt`

Verification:

- R2 migration summary:
  - `listedCount=54`
  - `migratedCount=54`
  - `byteCount=91,219,220`
  - `failedKeys=[]`
  - `localObjectCount=54`
  - `sampleVerified=5`
- VPS file storage:
  - `/var/expo-files` contains `54` object files and `54` `.meta.json` files.
- Existing migrated files opened through Node app routes:
  - Contract preview/download: `GET /api/file/contract_mocuawxl-de8c6508d73c18.pdf?orderId=32` returned `200 application/pdf`.
  - Booth map background: `GET /api/booth-map-asset/booth_map_1_1_1778148990585_6a781ce0-84e9-4183-b92f-1d756c95157c.png?mapId=1` returned `200 image/png`.
  - Public confirmation banner: `GET /api/public/exhibitor-confirmation-banner/exhibitor-confirmation-banners/project_1_1778219869010_7a3c7f68-7965-4f4b-a2c6-72eefc38e1e6.jpg` returned `200 image/jpeg`.
- Refrigerator image references: `0`, so no migrated refrigerator image route was applicable.
- Controlled upload smoke test:
  - `POST /api/upload` returned `{"success":true,"fileKey":"contract_migrationB2test20260510.pdf"}`.
  - Confirmed the uploaded object and metadata were created under `/var/expo-files`.
  - Removed the test upload object and metadata after verification to avoid leaving an orphan production file.
- Post-migration backup:
  - SQLite backup integrity: `ok`.
  - Backup tar contains `54` object files and `54` `.meta.json` files from `/var/expo-files`.
- `pm2 logs expo-server --lines 40 --nostream --no-color`: no recent error-log lines in the checked tail.

## Phase C: Production Workflow Verification

Run these checks against `http://8.136.49.187` after data and files are migrated:

- Login with a migrated staff account.
- Project list and selected project target.
- Dashboard counts.
- Order list, create/edit/cancel paths that are safe to test.
- Payment create/edit/delete on a controlled test order.
- Booth map load, background asset load, and final preview.
- Exhibition refrigerator/lintel/special decoration views.
- Public exhibitor confirmation link flow.
- Scheduled order release logs after at least one cron interval.

Acceptance:

- No persistent 500s in PM2 error logs.
- Browser workflows match Cloudflare production behavior.
- Any test records created during verification are documented and cleaned up if needed.

### Phase C Completion Record - 2026-05-10 21:50 CST

Completed:

- Took a pre-verification backup before controlled write tests:
  - `/var/backups/expo-server/20260510-214735/manifest.txt`
- Confirmed nginx serves the production static app at `http://8.136.49.187/` with `200 text/html`.
- Logged in through `POST /api/login` with migrated staff account `张萍清`; response returned a valid JWT and `must_change_password=true`, with no runtime error.
- Used a short-lived admin JWT generated from the VPS environment only for admin-scoped verification endpoints.
- Verified project/staff/dashboard reads:
  - `GET /api/projects`: `200`, `1` project.
  - `GET /api/staff`: `200`, `25` staff rows, including target data.
  - `GET /api/home-dashboard?projectId=1`: `200`.
  - `GET /api/order-dashboard-stats?projectId=1`: `200`.
  - `GET /api/orders?projectId=1&pageSize=5`: `200`.
- Verified booth map reads:
  - `GET /api/booth-maps?projectId=1`: `200`.
  - `GET /api/booth-map-runtime-view?projectId=1&id=1`: `200`.
  - `GET /api/booth-map-asset/<background>?mapId=1`: `200 image/png`.
- Verified exhibition module reads:
  - `GET /api/exhibition/refrigerator-configs?projectId=1`: `200`, `3` configs.
  - `GET /api/exhibition/refrigerator-rentals?projectId=1`: `200`.
  - `GET /api/exhibition/lintels?projectId=1`: `200`.
  - `GET /api/exhibition/special-decorations?projectId=1`: `200`.
- Ran controlled write workflow with marker `Codex C阶段验证 2026-05-10T13-49-32`:
  - Created no-booth order `136`.
  - Edited customer info.
  - Edited order fees from `100` to `120`.
  - Created a public exhibitor confirmation link and verified public overview via `GET /api/public/exhibitor-confirmations/<token>`.
  - Added payment `20`, listed payments, edited payment to `30`, and deleted the payment.
  - Canceled the order into pending state.
  - Deleted the pending order through `POST /api/delete-pending-order` as admin.
- Cleaned residual confirmation link/event rows for test order `136` directly after API cleanup.

Verification:

- Controlled test leftovers after cleanup:
  - `Orders` matching test marker or id `136`: `0`.
  - `Payments` for test order `136`: `0`.
  - `ExhibitorConfirmationLinks` for test order `136`: `0`.
  - `ExhibitorConfirmationEvents` for test order `136`: `0`.
- Production counts returned to post-migration baseline:
  - `Orders=104`
  - active `Payments=64`
  - `ExhibitorConfirmationLinks=12`
- SQLite integrity after controlled writes and cleanup: `ok`.
- Local file storage still contains `54` object files and `54` `.meta.json` files.
- `pm2 status expo-server --no-color`: `online`.
- `pm2 logs expo-server --lines 80 --nostream --no-color`: PM2 error log empty; out log includes scheduled order release runs at `21:00`, `21:15`, `21:30`, and `21:45` CST.

## Phase D: Cutover Decision

Cutover is ready only when:

- D1-to-SQLite row counts match.
- R2-to-local object counts match.
- Backup and restore have been tested after real data/files exist.
- PM2, nginx, and cron are healthy.
- Business workflow checks pass.
- Rollback path is clear.

Cutover options:

- IP-based temporary operation: keep using `http://8.136.49.187` for controlled internal verification.
- Domain cutover: update DNS/nginx only after the production workflow checks pass.

### Phase D Completion Record - 2026-05-10 21:55 CST

Decision:

- IP-based production operation on `http://8.136.49.187` is ready from the migration checklist perspective.
- Domain cutover is the only remaining external decision. Do it during a short maintenance window after DNS ownership/timing is confirmed.
- Cloudflare production should remain untouched until the domain cutover has propagated and the Node/VPS path is accepted as the production source of truth.

Completed:

- Ran a fresh post-migration backup after real D1 data and R2 objects were already on the VPS:
  - `/var/backups/expo-server/20260510-215246/manifest.txt`
- Restored that backup into a temporary drill directory:
  - `/tmp/expo-restore-phaseD-20260510-215250`
- Restored SQLite backup integrity returned `ok`.
- Restored file archive expanded successfully.
- Started a temporary restored Node app on `127.0.0.1:3099` using the restored SQLite file and restored local file directory.
- Verified the restored temporary app returned business `401` JSON for an invalid login probe, proving the restored DB/files can boot behind the Node runtime.
- Cleaned the temporary restore probe rows from both the production DB and restored drill DB.

Verification:

- Production DB versus restored DB row counts matched for all 28 Node app tables:
  - `Accounts=0`, `Agents=14`, `BoothLocks=0`, `BoothMapItems=465`, `BoothMaps=2`, `Booths=465`
  - `ExhibitionConfirmationSettings=1`, `ExhibitionLintels=3`, `ExhibitionRefrigeratorConfigs=3`, `ExhibitionRefrigeratorRentalItems=0`, `ExhibitionRefrigeratorRentals=0`, `ExhibitionSpecialDecorationReports=2`
  - `ExhibitorConfirmationEvents=1`, `ExhibitorConfirmationLinks=12`, `Expenses=0`, `Industries=6`, `LoginAttempts=11`
  - `OrderBoothChanges=15`, `OrderOverpaymentIssues=2`, `Orders=104`, `Payments=65`, `Prices=3`
  - `ProjectErpConfigs=1`, `ProjectOrderFieldSettings=14`, `ProjectOrderReleaseSettings=1`, `Projects=1`, `Staff=25`, `WriteRateLimits=15`
- Production file storage versus restored archive matched:
  - object files: `54/54`
  - metadata files: `54/54`
- `pm2 status expo-server --no-color`: `online`, zero restarts at the check time.
- `sudo -n nginx -t`: passed.
- `systemctl is-active nginx`: `active`.
- `systemctl is-active cron`: `active`.
- Backup cron is installed:
  - `10 3 * * * BACKUP_ENV_FILE=/opt/expo-server/.env.production bash /opt/expo-server/scripts/backup-sqlite.sh >/dev/null 2>&1`
- Public probes:
  - `GET http://8.136.49.187/`: `200 text/html`
  - `POST http://8.136.49.187/api/login` with an invalid probe account: business `401 application/json`, not runtime `500`
- Probe `LoginAttempts` rows were cleaned after verification.
- `pm2 logs expo-server --lines 80 --nostream --no-color`: PM2 error log empty; out log shows scheduled order release runs through `21:45` CST.

## Rollback Plan

If data import fails:

```sh
ssh admin@8.136.49.187 '
  pm2 stop expo-server
  cp /opt/expo-server/data/exhibition.sqlite.before-d1-import /opt/expo-server/data/exhibition.sqlite
  pm2 start expo-server
'
```

If R2 migration fails:

- Keep Cloudflare production as source of truth.
- Delete only the incomplete local storage root after confirming no live Node writes depend on it.
- Rerun `migrate:r2:local` after fixing the error.

If Node runtime fails after import:

- Keep Cloudflare Worker deployment untouched.
- Stop PM2 on the VPS.
- Use PM2/nginx logs and the imported SQLite copy for debugging without changing Cloudflare production.

## Open Questions

- Decide whether the R2 read-only migration token should be revoked after successful object migration and backup.
- Decide final DNS/domain cutover timing.
