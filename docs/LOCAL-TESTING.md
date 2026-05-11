# Local Testing Mode

This project now includes a stable local testing flow that does not depend on Cloudflare remote preview.

Important: this document is only for local development. The bootstrap data and test accounts created by `db:init:local` must not be reused in any public preview or production environment.

## What it gives you

- A local D1 database with full table structure
- A default admin account for login
- A sample project, product categories, prices, accounts, and booths
- A sample booth map with four positioned booths for visual testing
- Three sample orders and payments so booth colors can show `已预定 / 已付定金 / 已付全款`
- A repeatable reset command for starting over

## One-time setup

```bash
npm run db:init:local
```

This command will reset the local D1 database and load test data.

The reset SQL now lives at `db/local/20260320-1200-local-test-bootstrap.sql`, separate from formal production migrations.

## Start local testing

```bash
npm run dev -- --port 8788
```

Then open:

```text
http://127.0.0.1:8788
```

## Local login account

The bootstrap SQL seeds a small set of local-only test accounts so the UI can be tested immediately after reset.

If you need the exact test credentials, check the local bootstrap file:

- [db/local/20260320-1200-local-test-bootstrap.sql](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/db/local/20260320-1200-local-test-bootstrap.sql)

If you plan to share a preview with anyone else, change those seeded passwords first and do not expose the reset dataset directly online.

## When to run reset again

Run `npm run db:init:local` again when:

- you want to clear local test data
- you want to test from a clean state
- local tables were changed and need to be rebuilt

## Recommended workflow

1. Tell Codex the full batch of changes.
2. Codex updates code locally.
3. Run `npm run db:init:local` if needed.
4. Run `npm run dev -- --port 8788`.
5. Test in the browser locally.
6. After approval, push to GitHub for Cloudflare deployment.
