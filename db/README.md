# Database SQL Layout

- `migrations/`: formal incremental D1 migrations for preview/production
- `db/local/`: local reset/bootstrap scripts for repeatable manual testing
- `db/templates/`: reusable SQL templates and scaffolds

Rule of thumb:

- if a SQL file may be executed on a real remote database, keep it in `migrations/`
- if a SQL file drops and rebuilds local tables, keep it in `db/local/`
- if a SQL file is only a starting point for authoring, keep it in `db/templates/`
