# Local DB Scripts

This folder is for local-only D1 reset/bootstrap SQL.

- Safe use: `npm run db:init:local`
- Not for: preview/production migration apply

Files here may contain destructive statements such as `DROP TABLE IF EXISTS`.
