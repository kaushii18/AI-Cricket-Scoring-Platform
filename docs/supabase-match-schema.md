# Supabase Match Storage Schema

`database/migrations/001_create_cricpulse_matches.sql` prepares a separate
`public.cricpulse_matches` table for a future server-to-server sync stage. It is
not used by the app yet: Node still reads and writes
`backend/data/matches.json`, and no match data is sent to Supabase.

## What the migration creates

- A full `jsonb` match snapshot plus indexed status, team names, innings, and
  timestamps for listing active or recently updated matches.
- A monotonically compared `revision` field for optimistic concurrency. Future
  sync code must compare the expected revision and report a conflict rather
  than blindly upserting over a newer snapshot.
- Row-level security with no browser-role policies. `anon` and
  `authenticated` cannot access this table; only trusted server code using the
  Supabase `service_role` can bypass RLS. Do not put a service-role key in
  frontend code or commit it.
- No delete grant, retention job, or automatic cloud-history cleanup.

## Apply only after inspection

The migration intentionally uses `CREATE TABLE` without `IF NOT EXISTS`. If a
table with this name already exists, the migration stops instead of assuming
that the existing schema or data is safe to replace. Inspect the Supabase
project and take a database backup before applying it. Run the SQL once from
the Supabase SQL editor or through the project's reviewed migration workflow.
It does not modify the existing `teams` table or local match archive.

Supabase free plans have quotas and product limits that can change. Check the
project's current dashboard and plan documentation before enabling sync; this
schema does not imply unlimited cloud storage. The later sync implementation
must define an explicit cloud retention window, preserve local completed
archives, surface storage limits, and never silently delete records.

## Required decisions before enabling sync

The current project has no account or ownership model. This table is therefore
intended for a single trusted CricPulse backend, not direct multi-tenant access.
Before a public multi-user deployment, add authenticated ownership and
appropriate RLS policies. Sync also requires a server-only service-role
credential, explicit online/offline conflict behavior, and a backup/recovery
plan. Until those are implemented and tested, local JSON remains authoritative.
