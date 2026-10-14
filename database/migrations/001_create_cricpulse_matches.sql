begin;

create table public.cricpulse_matches (
    id text primary key,
    status text not null
        check (status in ('TOSS_PENDING', 'LIVE', 'COMPLETED')),
    team1 text not null check (length(btrim(team1)) > 0),
    team2 text not null check (length(btrim(team2)) > 0),
    current_innings smallint not null
        check (current_innings between 1 and 2),
    created_at timestamptz not null,
    updated_at timestamptz not null,
    revision bigint not null default 1
        check (revision > 0),
    synced_at timestamptz not null default now(),
    match_data jsonb not null
        check (jsonb_typeof(match_data) = 'object'),
    constraint cricpulse_matches_id_not_blank
        check (length(btrim(id)) > 0),
    constraint cricpulse_matches_distinct_teams
        check (lower(team1) <> lower(team2)),
    constraint cricpulse_matches_payload_identity
        check (
            match_data ->> 'id' = id
            and match_data ->> 'status' = status
            and match_data ->> 'team1' = team1
            and match_data ->> 'team2' = team2
            and match_data ->> 'currentInnings' = current_innings::text
        )
);

create index cricpulse_matches_status_updated_at_idx
    on public.cricpulse_matches (status, updated_at desc);

create index cricpulse_matches_created_at_idx
    on public.cricpulse_matches (created_at desc);

alter table public.cricpulse_matches enable row level security;

revoke all on table public.cricpulse_matches
    from public, anon, authenticated;
grant select, insert, update on table public.cricpulse_matches
    to service_role;

comment on table public.cricpulse_matches is
    'Server-only cloud snapshots for CricPulse matches; local JSON remains the archive.';
comment on column public.cricpulse_matches.revision is
    'Optimistic concurrency version; sync clients must compare before updating.';
comment on column public.cricpulse_matches.match_data is
    'Complete CricPulse match JSON snapshot, including ball-by-ball history.';

commit;
