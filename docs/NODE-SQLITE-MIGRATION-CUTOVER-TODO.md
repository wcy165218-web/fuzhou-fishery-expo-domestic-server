# Node + SQLite Migration Cutover Todo

Updated: 2026-05-11 16:37 CST

This document is the narrowed action list after validating the Node + SQLite migration phases A/B/C/D in `docs/NODE-SQLITE-MIGRATION-NEXT-STEPS.md`.

## Current Decision

The migration is ready for single-host HTTPS production operation from the checklist perspective.

Domain cutover target:

- `expo.chinafife.com`
- ERP app: `https://expo.chinafife.com/`
- Exhibitor confirmation links: `https://expo.chinafife.com/Exhibitors-confirmation/<token>`

Domain/TLS configuration completed on the VPS. Browser workflow smoke still needs a logged-in manual pass.

## Verified Locally

- Branch: `codex/node-sqlite-migration`.
- Migration artifacts exist:
  - `.tmp/migration/d1-full-archive.sql`
  - `.tmp/migration/d1-node-data.sql`
  - `.tmp/migration/rehearsal.sqlite`
- Local rehearsal SQLite integrity: `ok`.
- Local rehearsal row counts match the D1 baseline for all 28 Node app tables.
- Historical project mapping tables were intentionally archived only and are not imported into Node SQLite:
  - `Project_Accounts`
  - `Project_Industries`
  - `Project_Prices`
  - `Project_Staff_Map`
- No current runtime references were found for those four archived-only tables.
- `npm run check`: passed.
- `npm test`: passed.
- Public HTTP probes:
  - `GET http://8.136.49.187/`: `200 text/html`
  - public confirmation banner route: `200 image/jpeg`
  - protected file and booth-map asset routes return authenticated `401` JSON when no token is provided, which matches current auth behavior.

## Verification Gap

Earlier SSH read-only verification failed when using the default SSH identity because `admin@8.136.49.187` rejected the current public key:

```text
Permission denied (publickey).
```

Resolved by using the deployment key explicitly:

```sh
ssh -i ~/.ssh/id_ed25519_expo_vps -o IdentitiesOnly=yes admin@8.136.49.187
```

## Final Pre-Cutover Checklist Result

Completed: 2026-05-10 22:20 CST.

- VPS health: passed.
  - `expo-server` is `online` in PM2.
  - nginx config test passes.
  - nginx is `active`.
  - cron is `active`.
- Production SQLite: passed.
  - integrity check: `ok`.
  - `Orders=104`
  - `Payments=65` total, `64` active
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=12`
- Local file storage: passed.
  - object files: `54`
  - metadata files: `54`
  - R2 summary: `listedCount=54`, `migratedCount=54`, `byteCount=91219220`, `failedKeys=[]`, `localObjectCount=54`
- Fresh backup: passed.
  - latest backup directory: `/var/backups/expo-server/20260510-222014`
  - manifest: `/var/backups/expo-server/20260510-222014/manifest.txt`
  - backup SQLite integrity: `ok`
  - backup archive contains `54` object files and `54` metadata files.
- Public route smoke: passed.
  - `GET http://8.136.49.187/`: `200 text/html`
  - invalid login probe: `401 application/json`
- Probe cleanup: completed.
  - Removed `3` probe `LoginAttempts` rows.
  - Re-ran the fresh backup after cleanup so the latest backup is clean.

## Final Pre-Cutover Checklist

Run these checks in a short maintenance window before DNS changes.

### 1. VPS Health

```sh
ssh admin@8.136.49.187 '
  set -e
  pm2 status expo-server --no-color
  sudo -n nginx -t
  systemctl is-active nginx
  systemctl is-active cron
'
```

Accept when:

- `expo-server` is online.
- nginx config test passes.
- nginx is `active`.
- cron is `active`.

### 2. Production SQLite

```sh
ssh admin@8.136.49.187 '
  set -e
  sqlite3 /opt/expo-server/data/exhibition.sqlite "PRAGMA integrity_check;"
  sqlite3 /opt/expo-server/data/exhibition.sqlite "
    SELECT \"Orders\", COUNT(*) FROM Orders
    UNION ALL SELECT \"Payments\", COUNT(*) FROM Payments
    UNION ALL SELECT \"Staff\", COUNT(*) FROM Staff
    UNION ALL SELECT \"Projects\", COUNT(*) FROM Projects
    UNION ALL SELECT \"Booths\", COUNT(*) FROM Booths
    UNION ALL SELECT \"ExhibitorConfirmationLinks\", COUNT(*) FROM ExhibitorConfirmationLinks;
  "
'
```

Accept when:

- integrity check returns `ok`.
- key counts are consistent with the migration baseline and any known live changes.
- expected baseline before new production writes:
  - `Orders=104`
  - `Payments=65` total, `64` active
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=12`

### 3. Local File Storage

```sh
ssh admin@8.136.49.187 '
  set -e
  printf "object_files="
  find /var/expo-files -type f ! -name "*.meta.json" | wc -l
  printf "metadata_files="
  find /var/expo-files -type f -name "*.meta.json" | wc -l
  node -e "const s=require(\"/opt/expo-server/r2-migration-summary.json\"); console.log(JSON.stringify({listedCount:s.listedCount,migratedCount:s.migratedCount,byteCount:s.byteCount,failedKeys:s.failedKeys,localObjectCount:s.localObjectCount,sampleVerified:s.sampleVerified}, null, 2))"
'
```

Accept when:

- object files: `54`
- metadata files: `54`
- R2 summary:
  - `listedCount=54`
  - `migratedCount=54`
  - `byteCount=91219220`
  - `failedKeys=[]`
  - `localObjectCount=54`

### 4. Fresh Backup

```sh
ssh admin@8.136.49.187 '
  set -e
  BACKUP_ENV_FILE=/opt/expo-server/.env.production bash /opt/expo-server/scripts/backup-sqlite.sh
  latest=$(ls -1dt /var/backups/expo-server/* | head -1)
  echo "$latest"
  sed -n "1,120p" "$latest/manifest.txt"
'
```

Accept when:

- backup completes successfully.
- manifest includes SQLite and `/var/expo-files`.
- backup file count matches current local object storage.

### 5. Public Route Smoke

```sh
curl -sS -o /dev/null -w 'root %{http_code} %{content_type}\n' http://8.136.49.187/
curl -sS -o /dev/null -w 'login %{http_code} %{content_type}\n' \
  -H 'content-type: application/json' \
  --data '{"name":"__cutover_probe__","password":"invalid"}' \
  http://8.136.49.187/api/login
```

Accept when:

- root returns `200 text/html`.
- invalid login returns business `401 application/json`, not runtime `500`.

Clean any probe `LoginAttempts` rows if the check inserts one.

## Domain Cutover Plan

Only start this section after the final pre-cutover checklist passes.

Started: 2026-05-10 22:23 CST.

Started actions completed:

- Re-confirmed VPS health:
  - `expo-server` online in PM2.
  - `nginx -t` passed.
  - nginx and cron are `active`.
- Re-confirmed current VPS runtime env is still IP-based:
  - `CONFIRMATION_PUBLIC_ORIGIN=http://8.136.49.187/Exhibitors-confirmation`
  - `ALLOWED_ORIGINS=http://8.136.49.187`
  - `JWT_SECRET` and `ERP_CONFIG_SECRET` are present.
  - `UPLOAD_DEBUG=0`
- Re-confirmed nginx is still IP-based:
  - `server_name 8.136.49.187 _`
- Re-ran public IP smoke:
  - `GET http://8.136.49.187/`: `200 text/html`
  - invalid login probe: `401 application/json`
- Re-confirmed production SQLite and file baselines:
  - integrity check: `ok`
  - `Orders=104`
  - `Payments=65` total, `64` active
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=12`
  - object files: `54`
  - metadata files: `54`
- Created a fresh clean backup after probes:
  - `/var/backups/expo-server/20260510-222314`
  - manifest: `/var/backups/expo-server/20260510-222314/manifest.txt`
  - backup SQLite integrity: `ok`
- Identified the Cloudflare account zone candidate:
  - `zhanl4p.com` is active in Cloudflare.
  - public DNS currently resolves:
    - `zhanl4p.com -> 198.18.0.42`
    - `www.zhanl4p.com -> 198.18.0.43`
    - `erp.zhanl4p.com -> 198.18.0.44`
    - `confirmation.zhanl4p.com -> 198.18.0.45`

Current blocker:

- Cloudflare API zone listing works, but reading DNS records returned `10000: Authentication error`. DNS record update cannot be automated with the current token/session until DNS permissions are fixed, or the records are changed manually in the Cloudflare dashboard.

Prepared cutover helper:

- Added `scripts/configure-vps-domains.sh` for the Node + SQLite VPS path.
- Marked `scripts/configure-bwh-domains.sh` as legacy Worker-proxy only so it cannot accidentally proxy `/api` back to Cloudflare Worker during the Node cutover.
- Synced the helper scripts to `/opt/expo-server/scripts/` on the VPS and verified `bash -n` plus executable permissions there.
- Installed `certbot` and `python3-certbot-nginx` on the VPS; `certbot 2.1.0` is available for TLS issuance after DNS points to the VPS.

Single-host cutover preparation completed: 2026-05-10 22:38 CST.

- Updated `scripts/configure-vps-domains.sh` for one public host, for example `expo.example.com`.
- Synced the updated helper to `/opt/expo-server/scripts/configure-vps-domains.sh`.
- Verified local and VPS helper syntax with `bash -n`.
- Re-ran IP-based pre-domain smoke:
  - `GET http://8.136.49.187/`: `200 text/html`
  - invalid login probe: `401 application/json`
- Cleaned the probe `LoginAttempts` row after verification.
- Re-confirmed current VPS runtime remains IP-based until DNS is ready:
  - `CONFIRMATION_PUBLIC_ORIGIN=http://8.136.49.187/Exhibitors-confirmation`
  - `ALLOWED_ORIGINS=http://8.136.49.187`
  - `UPLOAD_DEBUG=0`
  - `JWT_SECRET` and `ERP_CONFIG_SECRET` are present.
- Re-confirmed current nginx remains IP-based until DNS is ready:
  - `server_name 8.136.49.187 _`
- Re-confirmed VPS health and data baselines:
  - `expo-server` online in PM2.
  - `nginx -t` passed.
  - nginx and cron are `active`.
  - SQLite integrity check: `ok`.
  - `Orders=104`
  - `Payments=65`
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=12`
  - object files: `54`
  - metadata files: `54`

Current domain cutover target:

- Use one ICP-ready public host, for example `expo.example.com`.
- The ERP app and public exhibitor confirmation links share that host.
- DNS only needs the selected host:
  - `expo.example.com A -> 8.136.49.187`
- Confirmation links will use:
  - `https://expo.example.com/Exhibitors-confirmation/<token>`

Once the selected host points to `8.136.49.187`, run on the VPS:

```sh
sudo bash /opt/expo-server/scripts/configure-vps-domains.sh expo.example.com <tls-admin-email>
```

The helper:

- verifies the selected public host resolves to `8.136.49.187`;
- creates a fresh backup before changing nginx/env;
- updates `ALLOWED_ORIGINS` and `CONFIRMATION_PUBLIC_ORIGIN` for single-host HTTPS operation;
- installs nginx server names for the Node upstream;
- requests/installs a Let's Encrypt certificate for the selected public host through certbot;
- reloads nginx and restarts `expo-server` through PM2.

1. Announce maintenance window and freeze writes on Cloudflare production.
2. Confirm the VPS has a fresh backup from the window.
3. Point DNS for the production domain to `8.136.49.187`.
4. Update nginx server names and TLS certificate if needed.
5. Confirm runtime env values on the VPS:
   - `JWT_SECRET`
   - `ERP_CONFIG_SECRET`
   - `ALLOWED_ORIGINS`
   - `CONFIRMATION_PUBLIC_ORIGIN`
   - `UPLOAD_DEBUG`
6. Restart or reload services:

```sh
ssh admin@8.136.49.187 '
  set -e
  sudo nginx -t
  sudo systemctl reload nginx
  pm2 restart expo-server
  pm2 status expo-server --no-color
'
```

7. Run post-cutover smoke checks against the production domain.

## Post-Cutover Smoke Checklist

Run these through the browser and API immediately after DNS/TLS is live.

Started: 2026-05-11 16:37 CST.

Automated domain/TLS checks completed:

- Ran:
  - `sudo bash /opt/expo-server/scripts/configure-vps-domains.sh expo.chinafife.com 262024634@qq.com`
- Fresh backup created before domain/env/nginx changes:
  - `/var/backups/expo-server/20260511-163600`
  - manifest: `/var/backups/expo-server/20260511-163600/manifest.txt`
  - backup SQLite integrity: `ok`
- Let's Encrypt certificate issued and installed:
  - subject: `CN=expo.chinafife.com`
  - issuer: `Let's Encrypt E7`
  - valid from `2026-05-11 07:37:44 UTC`
  - valid until `2026-08-09 07:37:43 UTC`
- Runtime env after cutover:
  - `ALLOWED_ORIGINS=https://expo.chinafife.com`
  - `CONFIRMATION_PUBLIC_ORIGIN=https://expo.chinafife.com/Exhibitors-confirmation`
  - `UPLOAD_DEBUG=0`
  - `JWT_SECRET` and `ERP_CONFIG_SECRET` are present.
- nginx/PM2:
  - nginx config test passed.
  - HTTP redirects to HTTPS for `expo.chinafife.com`.
  - `expo-server` restarted and is `online` in PM2.
- Domain smoke from the VPS:
  - `GET http://expo.chinafife.com/`: `301 https://expo.chinafife.com/`
  - `GET https://expo.chinafife.com/`: `200 text/html`
  - invalid login probe: `401 application/json`
- Local forced-resolution smoke:
  - `GET https://expo.chinafife.com/` with `expo.chinafife.com:443:8.136.49.187`: `200 text/html`
  - invalid login probe: `401 application/json`
- Production SQLite after cutover:
  - integrity check: `ok`
  - `Orders=104`
  - `Payments=65`
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=13`
  - The new link versus the earlier baseline is `id=14`, `order_id=134`, `created_by=admin`, `created_at=2026-05-10 22:44:44`; this predates the domain/TLS script.
- Probe cleanup:
  - probe `LoginAttempts` rows cleaned.
- Logs:
  - PM2 error log has no recent error lines.
  - Scheduled order release logs are present through `2026-05-11 16:30:00`.

Follow-up server-side check: 2026-05-11 16:49 CST.

- User-reported manual browser smoke is mostly normal; remaining abnormal items still need to be listed and resolved before marking the manual smoke complete.
- VPS health remains normal:
  - `expo-server` online in PM2.
  - `nginx -t` passed.
  - nginx and cron are `active`.
- SQLite remains healthy:
  - integrity check: `ok`.
  - `Orders=104`
  - `Payments=65`
  - `Staff=25`
  - `Projects=1`
  - `Booths=465`
  - `ExhibitorConfirmationLinks=14`
- Latest backup by modification time remains:
  - `/var/backups/expo-server/20260511-163600`
  - backup SQLite integrity: `ok`
- Logs remain clean:
  - PM2 error log has no recent error lines.
  - Scheduled order release logs are present through `2026-05-11 16:45:00`.
- A new confirmation link was created during manual testing:
  - `id=15`, `order_id=116`, `created_by=admin`, `created_at=2026-05-11 16:49:04`.
  - Clean or revoke this row if it was only a smoke-test artifact.

Confirmation share URL fix: 2026-05-11 17:07 CST.

- Issue found during manual smoke:
  - exhibitor confirmation share message still used the server IP URL.
- Root cause:
  - `/opt/expo-server/.env.production` had the new domain values, but the active PM2 process environment still had the old IP-based `ALLOWED_ORIGINS` and `CONFIRMATION_PUBLIC_ORIGIN`.
- Immediate fix applied on the VPS:
  - restarted `expo-server` with explicit `ALLOWED_ORIGINS=https://expo.chinafife.com`
  - restarted `expo-server` with explicit `CONFIRMATION_PUBLIC_ORIGIN=https://expo.chinafife.com/Exhibitors-confirmation`
- Follow-up hardening:
  - updated and re-synced `/opt/expo-server/scripts/configure-vps-domains.sh` so future runs pass the new domain env values explicitly into `pm2 restart --update-env`.
- Verification:
  - active PM2 env now reports `ALLOWED_ORIGINS=https://expo.chinafife.com`.
  - active PM2 env now reports `CONFIRMATION_PUBLIC_ORIGIN=https://expo.chinafife.com/Exhibitors-confirmation`.
  - `GET https://expo.chinafife.com/`: `200 text/html`.
  - invalid login probe: `401 application/json`.
  - probe `LoginAttempts` rows cleaned.
  - PM2 error log has no recent error lines.

Cloudflare write freeze: 2026-05-11 17:19 CST.

- Problem:
  - Cloudflare D1 was still receiving writes after the VPS/SQLite cutover.
  - Read-only comparison found D1 had one extra order versus VPS SQLite:
    - Cloudflare D1: `Orders=105`
    - VPS SQLite: `Orders=104`
    - extra D1 order: `id=136`, `company_name=昆山川邻包装容器科技有限公司`, `booth_id=2L43`, `sales_name=朱伟俊`, `created_at=2026-05-11 13:50:22`.
    - related R2 contract key: `contract_ec005e9c350add95f75cdcb79e7f2654.pdf`.
- Freeze implemented:
  - Deployed Cloudflare Worker version `901292e2-fefd-41c0-a48c-2bceb0c72288`.
  - Cloudflare requests for non-`workers.dev` external hosts now:
    - redirect non-API `GET`/`HEAD` to `https://expo.chinafife.com`;
    - return `410 application/json` for `/api/*`;
    - return `410 text/plain` for non-API mutating methods.
  - `workers.dev` remains available because it is not a known public entry.
  - Removed the Cloudflare Worker cron trigger from `wrangler.toml` and redeployed, so Cloudflare no longer runs the `*/15` scheduled order-release job against D1.
- Verification:
  - Old BWH/IP API probe `http://74.211.97.177/api/orders?projectId=1`: `410 application/json`.
  - Cloudflare latest deployment is `901292e2-fefd-41c0-a48c-2bceb0c72288`.
  - Latest deployment output no longer lists `schedule: */15 * * * *`.
  - D1 count after freeze remains `Orders=105`, latest D1 order timestamp remains `2026-05-11 13:50:22`.

Legacy VPS web entry shutdown: 2026-05-11 17:32 CST.

- Stopped and disabled nginx on the two legacy overseas VPS web entrypoints:
  - `74.211.97.177`
  - `45.152.65.100`
- Verification:
  - `systemctl is-active nginx`: `inactive` on both.
  - `systemctl is-enabled nginx`: `disabled` on both.
  - public HTTP probes to `/` and `/api/orders?projectId=1` on both IPs no longer return the old ERP page/API.

Cloudflare delta reconciliation: 2026-05-11 17:35 CST.

- Took a fresh pre-import VPS backup:
  - `/var/backups/expo-server/20260511-173445/manifest.txt`
- Imported the D1-only order into VPS SQLite:
  - `id=136`
  - `company_name=昆山川邻包装容器科技有限公司`
  - `booth_id=2L43`
  - `total_amount=6800`, `paid_amount=0`
  - `sales_name=朱伟俊`
  - `created_at=2026-05-11 13:50:22`
  - `contract_url=contract_ec005e9c350add95f75cdcb79e7f2654.pdf`
- Copied the related R2 contract file into VPS local storage:
  - `/var/expo-files/contract_ec005e9c350add95f75cdcb79e7f2654.pdf`
  - size: `1494418`
  - sha256: `77a4101269de58989064049ad9b94284576f3820afbdd9f29e6f463935eee408`
- Ran booth status sync for `project_id=1`, `booth_id=2L43`:
  - `可售` -> `已预定`
- Verification:
  - VPS `PRAGMA integrity_check`: `ok`
  - VPS `Orders=105`
  - VPS `Orders.id=136`: present
  - Cloudflare D1 `Orders=105`
  - Cloudflare D1 `Orders.id=136`: present
  - contract file and `.meta.json` both present under `/var/expo-files`

Production restore follow-up: 2026-05-11 22:18 CST.

- After the production database was restored from `/var/backups/expo-server/20260511-173445/exhibition.sqlite`, the previously reconciled D1-only order `id=136` was missing again because that backup was taken before the import.
- Took a fresh pre-write VPS backup:
  - `/var/backups/expo-server/20260511-restore-order-136/manifest.txt`
- Re-imported D1 `Orders.id=136` into the active VPS SQLite database.
- Re-applied booth status sync for `project_id=1`, `booth_id=2L43`:
  - `可售` -> `已预定`
- Verification:
  - VPS `PRAGMA integrity_check`: `ok`
  - VPS `Orders=105`
  - Cloudflare D1 `Orders=105`
  - VPS `Orders.id=136`: present
  - VPS `Booths(project_id=1,id=2L43).status=已预定`
  - contract file sha256 remains `77a4101269de58989064049ad9b94284576f3820afbdd9f29e6f463935eee408`
  - `GET https://expo.chinafife.com/`: `200`
  - invalid login probe: `401`
  - PM2 `expo-server`: `online`

Remaining manual browser smoke:

- Login with a migrated staff account.
- Project list loads and selected project is correct.
- Dashboard cards and order dashboard stats load.
- Order list opens with expected filters and pagination.
- Contract preview/download opens for an authorized user.
- Booth map loads, including background image.
- Exhibition refrigerator, lintel, and special-decoration views load.
- Public exhibitor confirmation link opens.
- Controlled write path:
  - create a clearly marked test order if business allows it;
  - add/edit/delete a test payment;
  - cancel/delete the test order if it was created;
  - clean confirmation link/event rows if needed.
- PM2 error log has no persistent 500s.
- Scheduled order release log appears after at least one cron interval.

## Observation Period

Keep Cloudflare production available as rollback reference until the Node/VPS path is accepted as the source of truth.

Recommended observation window:

- minimum: 24 hours
- preferred: 72 hours

During observation:

- Check PM2 status and logs at least twice daily.
- Confirm nightly backup job runs.
- Spot-check a restored backup if a new backup layout or path changes.
- Track any user-reported workflow differences from Cloudflare production.

## Rollback

If domain cutover fails before Node/VPS is accepted:

1. Point DNS back to Cloudflare.
2. Stop or firewall the VPS app if duplicate writes are a risk.
3. Preserve VPS SQLite and logs for diagnosis.
4. Do not delete Cloudflare D1/R2 data.

If the VPS DB must be restored:

```sh
ssh admin@8.136.49.187 '
  set -e
  pm2 stop expo-server
  cp /path/to/known-good/exhibition.sqlite /opt/expo-server/data/exhibition.sqlite
  pm2 start expo-server
'
```

Use the exact backup path from `/var/backups/expo-server/<timestamp>/manifest.txt`.

## Closeout Tasks

Do these only after the observation period is accepted.

- Revoke the R2 read-only migration token `expo-contracts-migration-readonly`.
- Archive migration artifacts outside Git:
  - D1 full archive SQL
  - Node import SQL
  - production SQLite backups
  - downloaded object files or backup tarballs
- Confirm `.env.r2.local`, production SQLite files, object files, and backup archives are not tracked by Git.
- Commit the Node/SQLite migration branch.
- Create a pull request or merge record with:
  - A/B/C/D completion summary
  - verification commands
  - backup/restore proof
  - remaining operational notes
