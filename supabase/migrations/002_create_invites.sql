create table if not exists bet_invites (
  id              uuid        primary key default gen_random_uuid(),
  creator         text        not null,
  template_key    text        not null,
  params          jsonb       not null,
  definition_text text        not null,
  definition_hash text        not null,
  resolve_at      timestamptz not null,
  join_deadline   timestamptz not null,
  stake           text        not null,
  pending_opponent text       null,
  status          text        not null default 'open',
  created_at      timestamptz not null default now()
);

create index if not exists bet_invites_creator on bet_invites (creator);
