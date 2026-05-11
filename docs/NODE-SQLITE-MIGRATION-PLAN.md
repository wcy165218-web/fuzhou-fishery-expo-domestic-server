# Node + SQLite Migration Plan

## Goal

Move the backend from Cloudflare Workers bindings to a domestic VPS with the smallest practical business-code change set.

Target runtime:

- Node.js 20
- SQLite via `better-sqlite3` with WAL
- Local filesystem storage replacing R2
- `node-cache` replacing KV
- PM2 process management
- nginx for static files and `/api/*` reverse proxy

Core strategy:

- Keep route and service business logic unchanged wherever possible.
- Preserve the current D1/R2/KV API shapes through adapters.
- Add Workers runtime shims for APIs that existing code already calls directly.
- Avoid MySQL translation. Current SQL relies on SQLite/D1 features such as `datetime()`, `strftime()`, `||`, `ON CONFLICT`, and `COLLATE NOCASE`.

## Branch Scope

Branch: `codex/node-sqlite-migration`

Primary new files:

- `server.mjs`
- `src/adapter/db.mjs`
- `src/adapter/storage.mjs`
- `src/adapter/cache.mjs`
- `src/adapter/env.mjs`
- `src/adapter/runtime-shims.mjs`
- `db/init-sqlite.sql`
- `db/drop-sqlite.sql`
- `scripts/migrate-r2-to-local.mjs`
- `scripts/backup-sqlite.sh`
- `scripts/deploy-vps-server.sh`
- `ecosystem.config.cjs`
- Adapter tests under `tests/`

Expected cleanup:

- Remove Cloudflare usage monitoring backend route.
- Remove usage monitoring frontend nav, lazy loader entry, HTML container, tests, and old script.

## Phase 0: Baseline

- Run `npm run check`.
- Run `npm test`.
- Record required runtime env vars:
  - `JWT_SECRET`
  - `ERP_CONFIG_SECRET`
  - `ALLOWED_ORIGINS`
  - `CONFIRMATION_PUBLIC_ORIGIN`
  - `UPLOAD_DEBUG`
- Record D1 table row counts before migration.
- Record R2 object count before migration.

Done when:

- Current baseline is known.
- Any pre-existing failures are documented before refactor work starts.

### Phase 0 Baseline Record - 2026-05-10 00:12 CST

Local verification:

- `npm run check`: passed.
- `npm test`: passed.

Runtime env vars to carry into Node/PM2:

| Variable | Status / source |
| --- | --- |
| `JWT_SECRET` | Required secret in `wrangler.toml`; required by JWT signing. |
| `ERP_CONFIG_SECRET` | Runtime secret documented in `README.md`; code falls back to `JWT_SECRET` only if missing. |
| `ALLOWED_ORIGINS` | Optional runtime var documented in `README.md` and `.dev.vars.example`; comma-separated CORS allowlist. |
| `CONFIRMATION_PUBLIC_ORIGIN` | Configured in `wrangler.toml` as `http://74.211.97.177/Exhibitors-confirmation`. |
| `UPLOAD_DEBUG` | Optional runtime var; enable with `1` for upload diagnostics. |

Cloudflare production inventory:

- D1 database: `exhibition_db` (`c190ca96-3fa2-48bf-aade-0b995f4f02bd`).
- R2 bucket: `expo-contracts`.
- D1 table row counts: recorded on `2026-05-10 22:10 CST` after Wrangler OAuth login.
- R2 object count: recorded on `2026-05-10 22:08 CST` through `wrangler r2 bucket info expo-contracts`.

Cloudflare auth record - 2026-05-10 22:07 CST:

- `HOME=$PWD/.wrangler-home wrangler login --callback-host 127.0.0.1`: succeeded.
- `npm run cf:whoami`: logged in as `wcy165218@gmail.com`.
- Account ID: `bb5582c4aed9457c0c431e8114588ccc`.
- Remote D1 table list query against `exhibition_db`: succeeded.
- R2 bucket list query: succeeded; buckets include `expo-contracts` and `expo-confirmation-preview-assets`.
- R2 S3 migration credentials were created on `2026-05-10 21:28 CST`:
  - Token name: `expo-contracts-migration-readonly`
  - Permission: `Object Read only`
  - Scope: bucket `expo-contracts`
  - Local env file: `.env.r2.local` (gitignored, mode `600`)

Cloudflare production D1 row counts - 2026-05-10 22:10 CST:

| Table | Rows |
| --- | ---: |
| `Accounts` | 0 |
| `Agents` | 14 |
| `BoothLocks` | 0 |
| `BoothMapItems` | 465 |
| `BoothMaps` | 2 |
| `Booths` | 465 |
| `ExhibitionConfirmationSettings` | 1 |
| `ExhibitionLintels` | 3 |
| `ExhibitionRefrigeratorConfigs` | 3 |
| `ExhibitionRefrigeratorRentalItems` | 0 |
| `ExhibitionRefrigeratorRentals` | 0 |
| `ExhibitionSpecialDecorationReports` | 2 |
| `ExhibitorConfirmationEvents` | 1 |
| `ExhibitorConfirmationLinks` | 12 |
| `Expenses` | 0 |
| `Industries` | 6 |
| `LoginAttempts` | 11 |
| `OrderBoothChanges` | 15 |
| `OrderOverpaymentIssues` | 2 |
| `Orders` | 104 |
| `Payments` | 65 |
| `Prices` | 3 |
| `ProjectErpConfigs` | 1 |
| `ProjectOrderFieldSettings` | 14 |
| `ProjectOrderReleaseSettings` | 1 |
| `Project_Accounts` | 1 |
| `Project_Industries` | 1 |
| `Project_Prices` | 3 |
| `Project_Staff_Map` | 1 |
| `Projects` | 1 |
| `Staff` | 25 |
| `WriteRateLimits` | 15 |

Cloudflare production R2 inventory - 2026-05-10 22:08 CST:

| Bucket | Object count | Size | Location |
| --- | ---: | ---: | --- |
| `expo-contracts` | 54 | 91.2 MB | APAC |

R2 migration credential verification - 2026-05-10 21:28 CST:

- `npm run migrate:r2:local -- --env-file .env.r2.local --bucket expo-contracts --dry-run --summary .tmp/r2-dry-run-summary.json --sample-size 0`: passed.
- Dry run listed `54` objects.
- Dry run byte count: `91,219,220`.
- Failed keys: `0`.

Commands to rerun if Cloudflare auth needs to be rechecked:

```sh
HOME=$PWD/.wrangler-home wrangler login --callback-host 127.0.0.1
HOME=$PWD/.wrangler-home wrangler d1 execute exhibition_db --remote --json \
  --command "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
```

Note: D1 rejected the original long `UNION ALL` row-count query with `too many terms in compound SELECT`; use scalar subqueries in one `SELECT` or split the query into smaller batches.

## Phase 1: Dependencies And Runtime Skeleton

Add dependencies:

- `better-sqlite3`
- `node-cache`
- `node-cron`
- Optional: `dotenv`

Add `server.mjs`:

- Import the existing `_worker.js` default export.
- Build `env` through `src/adapter/env.mjs`.
- Convert Node `IncomingMessage` to Web `Request`.
- Convert Web `Response` to Node `ServerResponse`.
- Pass a compatible `ctx.waitUntil()` object to `_worker.fetch()`.
- Use `node-cron` to call `_worker.scheduled()` every 15 minutes.
- In production, only handle API requests; static files are served by nginx.

Done when:

- `node --check server.mjs` passes.
- `/api/login` returns a business response instead of a runtime 500.
- Scheduled order release logs are visible.

### Phase 1 Implementation Record - 2026-05-10 00:18 CST

Implemented:

- Added runtime dependencies: `better-sqlite3`, `node-cache`, `node-cron`, and `dotenv`.
- Added `server.mjs` Node HTTP entrypoint that imports `_worker.js`, converts Node requests to Web `Request`, writes Web `Response` back to `ServerResponse`, and passes a compatible `ctx.waitUntil()`.
- Added `src/adapter/env.mjs` to build Worker-compatible bindings from local env, `wrangler.toml` `[vars]`, SQLite, filesystem storage, in-memory KV, and static assets.
- Added first-pass compatibility adapters:
  - `src/adapter/db.mjs`
  - `src/adapter/cache.mjs`
  - `src/adapter/storage.mjs`
  - `src/adapter/runtime-shims.mjs`
- Added `npm run check:node-runtime` and included it in `npm run check`.
- Added `npm start` for `node server.mjs`.

Verification:

- `node --check server.mjs`: passed via `npm run check:node-runtime`.
- `npm run check`: passed.
- `npm test`: passed.
- Temporary local SQLite bootstrap + Node server smoke test:
  - `PORT=8797 SQLITE_DB_PATH=.tmp/p1.sqlite FILE_STORAGE_ROOT=.tmp/files JWT_SECRET=p1-local-secret RUN_SCHEDULED_ON_START=1 node server.mjs`
  - Startup logs showed scheduled order release startup run and `*/15 * * * *` cron registration.
  - `POST /api/login` with an invalid password returned a business `401` JSON response: `账号或密码错误，已连续失败 1 次`.

## Phase 2: D1-Compatible SQLite Adapter

Implement `src/adapter/db.mjs`.

Required API:

- `env.DB.prepare(sql).bind(...params).first()`
- `env.DB.prepare(sql).bind(...params).all()`
- `env.DB.prepare(sql).bind(...params).run()`
- `env.DB.batch(statements)`

Return semantics:

- `first()` returns the first row or `null`.
- `all()` returns `{ results: rows }`.
- `run()` returns:
  - `success: true`
  - `meta.changes`
  - `meta.last_row_id`
  - `meta.lastRowId`
  - Optional direct aliases such as `changes` and `lastID`.
- `batch()` wraps statements in a SQLite transaction and rolls back on any failure.

Startup pragmas:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

Adapter rules:

- Keep the async D1 outward shape even though `better-sqlite3` is synchronous.
- Do not translate SQL.
- Keep transactions short.
- Surface useful SQL error context without logging secrets.

Done when:

- Adapter tests cover `first`, `all`, `run`, and `batch`.
- Tests cover `ON CONFLICT`, `datetime()`, `strftime()`, `||`, and `COLLATE NOCASE`.
- Existing route/service tests still pass with mocks unchanged.

### Phase 2 Implementation Record - 2026-05-10 00:31 CST

Implemented:

- Completed `src/adapter/db.mjs` D1-compatible adapter coverage for `prepare().bind().first()`, `all()`, `run()`, and `batch()`.
- Kept the async D1 outward shape while using synchronous `better-sqlite3` internally.
- Preserved native SQLite SQL without translation.
- Added run-result aliases expected by existing route code: `meta.changes`, `meta.last_row_id`, `meta.lastRowId`, `changes`, and `lastID`.
- Applied startup pragmas for WAL, normal synchronous mode, busy timeout, and foreign keys.
- Wrapped `batch()` in a SQLite transaction and tightened validation so all statements must come from the same database.
- Added redacted SQL context to adapter errors without including bound parameter values.
- Added `tests/d1-sqlite-adapter.test.mjs` and wired it into `npm test`.

Verification:

- `node tests/d1-sqlite-adapter.test.mjs`: passed.
- `npm run check`: passed.
- `npm test`: passed.

## Phase 3: R2, KV, And Cache Shims

Implement `src/adapter/storage.mjs`.

Required API:

- `put(key, body, { httpMetadata })`
- `get(key)`
- `delete(key)`

`get(key)` must return an object compatible with current route code:

- `body`: Web `ReadableStream`
- `httpEtag`
- `httpMetadata`
- `writeHttpMetadata(headers)`
- `arrayBuffer()`

Storage safety:

- Reject empty keys.
- Reject absolute paths.
- Reject `../` and other path traversal.
- Resolve the final path and verify it stays under `/var/expo-files`.
- Store metadata in a sidecar file, for example `<object>.meta.json`.

Implement `src/adapter/cache.mjs`.

Required API:

- `get(key, 'json')`
- `put(key, value, { expirationTtl })`
- `delete(key)`

Implement `src/adapter/runtime-shims.mjs`.

Required global shim:

- `globalThis.caches.default.match(request)`
- `globalThis.caches.default.put(request, response)`
- `globalThis.caches.default.delete(request)`

Initial implementation may be no-op or small in-memory cache. The priority is compatibility.

Done when:

- Contract upload and download work.
- `etag` and 304 behavior work.
- Booth map background asset route does not fail on `caches.default`.

### Phase 3 Implementation Record - 2026-05-10 00:54 CST

Implemented:

- Completed local filesystem object storage coverage for `src/adapter/storage.mjs`:
  - `put(key, body, { httpMetadata })`
  - `get(key)`
  - `delete(key)`
- Preserved the R2 object shape used by current route code:
  - Web `ReadableStream` body
  - `httpEtag`
  - `httpMetadata`
  - `writeHttpMetadata(headers)`
  - `arrayBuffer()`
- Stored object metadata in `<object>.meta.json` sidecar files.
- Verified storage key safety for empty keys, absolute paths, and path traversal.
- Verified `src/adapter/cache.mjs` supports `get(key, 'json')`, `put(key, value, { expirationTtl })`, and `delete(key)`.
- Verified `src/adapter/runtime-shims.mjs` installs `globalThis.caches.default.match/put/delete` when the Workers Cache API is absent.
- Added `tests/node-runtime-adapters.test.mjs` and wired it into `npm test`.

Verification:

- `node tests/node-runtime-adapters.test.mjs`: passed.
- `npm run check:node-runtime`: passed.
- `npm test`: passed.

## Phase 4: SQLite Schema And Data Migration

Create `db/init-sqlite.sql`.

Recommended source:

- Start from `db/local/20260320-1200-local-test-bootstrap.sql`.
- Merge all current `migrations/*.sql` into a single production-ready schema.
- Keep SQLite features that are already used by the app.

Create `db/drop-sqlite.sql` for local reset.

Migration steps:

- Export D1 production data.
- Import data into the SQLite file used by Node.
- Verify per-table row counts.
- Verify important uniqueness and indexes:
  - Single super admin constraint for `Staff`.
  - `Payments.erp_record_id`.
  - `Booths(id, project_id)`.
  - `BoothLocks(project_id, booth_id)`.

Done when:

- All tables exist.
- Row counts match D1 export.
- Login works using migrated staff data.
- Orders, booths, payments, and exhibition data are readable.

### Phase 4 Implementation Record - 2026-05-10 01:10 CST

Implemented:

- Added `db/init-sqlite.sql` as an empty production SQLite schema for the Node runtime.
- Added `db/drop-sqlite.sql` for local reset and restore drills.
- Merged the current local bootstrap schema with all migrations through `20260505-0200-confirmation-collection-deadline.sql`.
- Included the current refrigerator rental columns:
  - `rental_mode`
  - `usage_location`
  - `venue_confirmed`
  - `venue_confirmed_by`
  - `venue_confirmed_at`
- Included the latest secondary indexes:
  - `idx_agents_project_deleted_sales`
  - `idx_order_booth_changes_project_order_changed_at`
  - `idx_order_overpayment_issues_project_status`
  - `idx_expenses_project_type_deleted`
- Added `tests/sqlite-schema.test.mjs` to verify:
  - all expected app tables exist
  - all expected explicit indexes exist
  - single super admin uniqueness
  - `Payments.erp_record_id` uniqueness
  - `Booths(id, project_id)` uniqueness
  - `BoothLocks(project_id, booth_id)` uniqueness
  - `drop-sqlite.sql` removes all app tables

Verification:

- `node tests/sqlite-schema.test.mjs`: passed.
- `npm run check`: passed.
- `npm test`: passed.

Production data migration remains pending:

- D1 data export/import: pending.
- Migrated row-count comparison: pending.
- Login/orders/booths/payments/exhibition read checks against migrated data: pending.

## Phase 5: Remove Usage Monitoring

Backend cleanup:

- Remove `src/routes/usage.mjs`.
- Remove `handleUsageRoutes` import from `src/router.mjs`.
- Remove `/api/usage/metrics` route registration.

Frontend cleanup:

- Remove `usage` from `navConfig` in `public/js/auth.js`.
- Remove `usage` from the lazy feature manifest.
- Remove the workbench branch that loads the usage panel.
- Remove `sec-usage` from `public/index.html`.
- Delete `public/js/usage.js`.

Test cleanup:

- Update `tests/workbench-tabs.test.mjs` so the expected feature manifest no longer includes `usage`.
- Run full tests.

Done when:

- No `usage` nav appears.
- No code references `/api/usage/metrics`.
- Full tests pass.

Verification:

- Removed Cloudflare usage monitoring backend route, frontend nav/lazy loader/workbench panel, HTML container, legacy removal script, and usage page files.
- `rg -n "/api/usage/metrics|handleUsageRoutes|initUsagePage|sec-usage|usage-root|js/usage|用量监控|remove-usage-monitor" src public tests scripts package.json`: no matches.
- `npm run check`: passed.
- `npm test`: passed.

## Phase 6: VPS Operations

Add `ecosystem.config.cjs`.

Requirements:

- Single PM2 fork instance.
- `max_memory_restart: '500M'`.
- Environment variables passed through PM2 or an env file.

Add `scripts/deploy-vps-server.sh`.

Requirements:

- rsync server files.
- Run `npm ci --omit=dev`.
- Ensure runtime directories exist.
- Start or reload PM2.

Add `scripts/backup-sqlite.sh`.

Requirements:

- Use SQLite backup API, `sqlite3 .backup`, or checkpoint before backup.
- Do not rely on copying only the main `.sqlite` file while WAL is active.
- Back up `/var/expo-files`.
- Keep recent backups, for example 7 to 14 days.
- Write a clear backup log.

Server directories:

- `/opt/expo-server`
- `/var/expo-files`
- `/var/backups/expo-server`
- `/var/www/expo-static`

nginx requirements:

- `/api/*` proxies to `127.0.0.1:3000`.
- Static files are served from `/var/www/expo-static`.
- Security headers preserved or added at nginx/static layer where appropriate.

Done when:

- PM2 process is healthy.
- Backup script succeeds manually.
- nginx serves static files and proxies API requests.

Progress before VPS purchase - 2026-05-10 20:15 CST:

- Added `ecosystem.config.cjs` with one PM2 fork instance, `max_memory_restart: '500M'`, production defaults for `HOST=127.0.0.1`, `PORT=3000`, SQLite path, file storage root, and static root. It loads `.env.production` / `.env` so secrets can live in the server-side env file.
- Added `scripts/deploy-vps-server.sh` for rsyncing server files to `/opt/expo-server`, ensuring `/var/expo-files`, `/var/backups/expo-server`, `/var/www/expo-static`, and the server data directory exist, running `npm ci --omit=dev`, and starting/reloading PM2 with `pm2 startOrReload ecosystem.config.cjs`.
- Added `scripts/backup-sqlite.sh` using `sqlite3 .backup` after a WAL checkpoint, plus backup integrity verification, `/var/expo-files` tarball backup, 14-day retention by default, per-run manifest, and clear logs under `/var/backups/expo-server`.
- Added `ops/nginx/expo-server.conf` as the nginx server block template: `/api/*` proxies to `127.0.0.1:3000`, static files are served from `/var/www/expo-static`, and static/security headers are included.
- Added npm scripts:
  - `deploy:vps:server:check`
  - `deploy:vps:server`
  - `backup:sqlite`
  - `deploy:vps:check` now checks both static and server deployment connectivity.
- Extended `.deploy.vps.env.example` with server path, file storage root, backup path, remote env file, and PM2 app name.

Local verification completed:

- `zsh -n scripts/deploy-vps-server.sh`: passed.
- `bash -n scripts/backup-sqlite.sh`: passed.
- `node --check ecosystem.config.cjs`: passed.
- `node -e "const cfg=require('./ecosystem.config.cjs'); ..."` confirmed `expo-server`, fork mode, one instance, `500M`, and port `3000`.
- `npm run check:node-runtime`: passed.
- `npm run check`: passed.
- `npm test`: passed.
- `scripts/backup-sqlite.sh` was run against a temporary WAL-mode SQLite database and temporary file storage; it produced a verified backup database, `expo-files.tar.gz`, manifest, and backup log.

Still blocked until a VPS exists:

- Run `npm run deploy:vps:server:check` against the real host.
- Run `npm run deploy:vps:server` and confirm `pm2 status expo-server`.
- Run `npm run backup:sqlite` on the server against the real production DB and storage root.
- Install/enable nginx config, then run `nginx -t`, reload nginx, and verify static files plus `/api/*` proxying.

VPS verification - 2026-05-10 20:56 CST:

- Server: Aliyun Lightweight Application Server, `cn-hangzhou`, public IP `8.136.49.187`, Debian 12.10, 2 vCPU / 2 GiB / 40 GiB.
- Firewall rules verified in Aliyun console:
  - TCP `22` from `0.0.0.0/0`
  - TCP `80` from `0.0.0.0/0`
  - TCP `443` from `0.0.0.0/0`
- Added local deploy SSH public key to `admin@8.136.49.187` and verified `sudo -n true`.
- Installed server runtime packages:
  - Node.js `v20.20.2`
  - npm `10.8.2`
  - PM2 `7.0.1`
  - nginx `1.22.1`
  - sqlite3 `3.40.1`
  - rsync, cron, build-essential, curl, ca-certificates, gnupg
- Created runtime directories:
  - `/opt/expo-server`
  - `/opt/expo-server/data`
  - `/var/expo-files`
  - `/var/backups/expo-server`
  - `/var/www/expo-static`
- Wrote `/opt/expo-server/.env.production` with generated deployment secrets and IP-based origins:
  - `HOST=127.0.0.1`
  - `PORT=3000`
  - `SQLITE_DB_PATH=/opt/expo-server/data/exhibition.sqlite`
  - `FILE_STORAGE_ROOT=/var/expo-files`
  - `PUBLIC_DIR=/var/www/expo-static`
  - `CONFIRMATION_PUBLIC_ORIGIN=http://8.136.49.187/Exhibitors-confirmation`
  - `ALLOWED_ORIGINS=http://8.136.49.187`
- Ran `npm run deploy:vps:check`: passed for static and server targets.
- Ran `npm run deploy:vps:server`: passed, including `npm ci --omit=dev`, PM2 start/reload, and `pm2 save`.
- Initialized `/opt/expo-server/data/exhibition.sqlite` from `/opt/expo-server/db/init-sqlite.sql`; table count is `28`.
- Ran `npm run deploy:vps:static`: passed.
- Installed nginx config from `ops/nginx/expo-server.conf`, changed `server_name` to `8.136.49.187 _`, disabled default nginx site, and ran `nginx -t`: passed.
- Verified public static serving:
  - `curl http://8.136.49.187/`: HTTP `200`, `281117` bytes.
- Verified public API proxy:
  - `POST http://8.136.49.187/api/login` with probe credentials: HTTP `401` business JSON from Node, not nginx 404.
- Ran manual backup on the server:
  - backup dir `/var/backups/expo-server/20260510-205531`
  - SQLite backup `exhibition.sqlite`, `339968` bytes
  - file storage archive `expo-files.tar.gz`, `109` bytes
  - `sqlite_integrity=ok`
- Added daily backup cron:
  - `10 3 * * * BACKUP_ENV_FILE=/opt/expo-server/.env.production bash /opt/expo-server/scripts/backup-sqlite.sh >/dev/null 2>&1`
- PM2 startup service:
  - `pm2-admin` is `enabled` and `active`
  - `expo-server` is `online`
- nginx and cron services are `active`.

Notes before real data migration:

- The server currently has an empty initialized SQLite schema. Production data still needs Phase 7 / final migration work.
- The generated `ERP_CONFIG_SECRET` is suitable for a fresh server. If migrated D1 rows contain ERP config encrypted with the old Cloudflare secret, replace `/opt/expo-server/.env.production` with the old `ERP_CONFIG_SECRET` before importing production data.

## Phase 7: R2 Object Migration

Add `scripts/migrate-r2-to-local.mjs`.

Requirements:

- Download all current R2 objects.
- Preserve object keys under the local storage root.
- Preserve content type metadata where available.
- Write sidecar metadata files compatible with `storage.mjs`.
- Produce a migration summary:
  - object count
  - byte count
  - failed keys

Done when:

- Local object count matches R2 object count.
- Random sample downloads match expected files.
- Contract and booth background images can be served from local storage.

### Phase 7 Implementation Record - 2026-05-10 21:34 CST

Implemented:

- Added `scripts/migrate-r2-to-local.mjs` for Cloudflare R2 S3-compatible migration into the Node local file storage root.
- The script:
  - lists all objects with `ListObjectsV2`
  - downloads each object with signed R2 S3 API requests
  - preserves object keys under `FILE_STORAGE_ROOT` / `/var/expo-files`
  - rejects unsafe keys before writing, including absolute paths and `../` traversal
  - writes sidecar `<object>.meta.json` files compatible with `src/adapter/storage.mjs`
  - preserves available HTTP metadata such as content type and cache control
  - writes a JSON migration summary with listed count, migrated count, byte count, local object count, failed keys, and optional sample verification
  - supports `--dry-run`, `--prefix`, `--concurrency`, `--summary`, `--env-file`, and `--sample-size`
- Added npm script:
  - `migrate:r2:local`
- Added `tests/r2-migration-script.test.mjs` covering:
  - R2 list XML parsing
  - object download into local storage
  - metadata sidecar compatibility
  - unsafe key rejection
  - deterministic sample verification
- Included the migration script in `npm run check:node-runtime` and full `npm test`.

Required credentials for the real run:

```sh
CF_ACCOUNT_ID=bb5582c4aed9457c0c431e8114588ccc
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
FILE_STORAGE_ROOT=/var/expo-files
npm run migrate:r2:local -- --bucket expo-contracts --summary /opt/expo-server/r2-migration-summary.json --sample-size 5
```

Verification:

- `node --check scripts/migrate-r2-to-local.mjs`: passed.
- `node tests/r2-migration-script.test.mjs`: passed.
- `npm run migrate:r2:local -- --help`: passed.
- `npm run check`: passed.
- `npm test`: passed.

Real R2 migration is unblocked after R2 S3 credential creation:

- R2 object count: recorded as `54`.
- Production object download to `/var/expo-files`: pending.
- Random sample verification against production R2: pending.
- Contract, booth map background, refrigerator image, and confirmation banner serving checks against migrated production objects: pending.

## Phase 8: Final Verification

Local verification:

- `npm run check`
- `npm test`
- `node --check server.mjs`

Server verification:

- `pm2 status`
- `pm2 logs`
- `curl http://127.0.0.1:3000/api/login`
- Browser login.
- Order CRUD.
- Payment create/edit/delete.
- Contract upload, preview, and download.
- Booth map background upload and final preview.
- Exhibition management flows.
- Public exhibitor confirmation link flow.
- Wait 15 minutes and confirm scheduled order release logs.

Final acceptance:

- No persistent 500s in PM2 logs.
- D1 to SQLite row counts match.
- R2 to local object counts match.
- Backup can be created and restored into a test database.
- Cloudflare-specific usage monitoring is gone from backend and frontend.

### Phase 8 Verification Record - 2026-05-10 21:10 CST

Local verification completed:

- `npm run check`: passed.
- `npm test`: passed.
- `node --check server.mjs`: passed.
- Usage monitoring cleanup was rechecked with `rg -n "/api/usage/metrics|handleUsageRoutes|initUsagePage|sec-usage|usage-root|js/usage|用量监控|remove-usage-monitor" src public tests scripts package.json`; no matches.

Server verification completed against Aliyun VPS `8.136.49.187`:

- `pm2 status expo-server --no-color`: `expo-server` is `online`, fork mode, zero restarts, memory about `72.6mb` at check time.
- `pm2 logs expo-server --lines 80 --nostream --no-color`: no recent error-log output; out log shows server startup and scheduled order release cron registration.
- Scheduled job verification: PM2 out log includes `[scheduled] order release run started (cron)` and `[scheduled] order release run queued (cron)` at `2026-05-10T21:00:00`.
- Local Node API probe from the server: `POST http://127.0.0.1:3000/api/login` returned business `401 Unauthorized` JSON response headers, not a runtime 500.
- Public nginx/API probe: `POST http://8.136.49.187/api/login` returned business `401 Unauthorized` through nginx.
- Public static probe: `GET http://8.136.49.187/` returned HTTP `200`, `Content-Length: 281117`, nginx static headers present.
- Server SQLite schema count: `/opt/expo-server/data/exhibition.sqlite` contains `28` app tables.
- Local file storage object count under `/var/expo-files`: `0`, expected before real R2 migration.
- Backup restore check: copied the latest backup SQLite file to `/tmp/p8-restore-check.sqlite`; `PRAGMA integrity_check` returned `ok`, and the restored test database still contained `28` app tables.

Still blocked before final production acceptance:

- Cloudflare auth is now available locally through `.wrangler-home`.
- D1 production row counts are recorded, but production data import into SQLite and row-count comparison remain pending.
- R2 S3 credentials are now present in `.env.r2.local`, and dry-run listing passed; real R2 object migration and R2-to-local object-count comparison remain pending.
- Browser login, Order CRUD, Payment create/edit/delete, contract upload/preview/download, booth map background upload/final preview, exhibition management, and public exhibitor confirmation link checks need to be rerun after production data and R2 objects are migrated. The current VPS database is the empty initialized schema.

## Risks And Guardrails

- SQLite WAL is suitable for this backend management workload, but write transactions must stay short.
- Local file storage needs real backup and restore testing because it replaces R2 durability.
- `better-sqlite3` is synchronous, so avoid long-running transactions inside request handlers.
- Do not change business SQL unless a real runtime issue proves it is necessary.
- If a route requires a missing Worker API, add a shim before editing business code.
