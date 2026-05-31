create table if not exists bets (
  id           bigserial primary key,
  on_chain_id  text        not null unique,
  creator      text        not null,
  opponent     text        not null,
  stake        text        not null,
  definition_text  text    not null,
  definition_hash  text    not null,
  template_key text        not null,
  params       jsonb       not null default '{}',
  resolve_at   timestamptz not null,
  status       text        not null default 'Pending',
  proposed_winner text     null,
  evidence     jsonb       null,
  created_at   timestamptz not null default now()
);

create index if not exists bets_status_resolve_at on bets (status, resolve_at);
