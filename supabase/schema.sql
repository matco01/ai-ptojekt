-- AI prodavač – database schema. Run once in Supabase → SQL Editor → Run.
-- Safe to run again: it only creates what is missing.

-- One row per shop that uses the AI salesperson.
create table if not exists clients (
  id          text primary key,              -- used in the embed: data-client="id"
  name        text not null,                 -- shop name shown in the dashboard
  domains     text[] not null default '{}',  -- where the widget may run, e.g. {kavarna-boheme.cz}
  agent_name  text,                          -- fixed name of the AI (empty = derived from the brand)
  admin_token text,                          -- the shop owner's dashboard password
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Customer behaviour + AI activity, per client.
create table if not exists events (
  id          bigint generated always as identity primary key,
  client_id   text not null references clients(id) on delete cascade,
  session_id  text,
  type        text not null,
  ts          bigint not null,                -- milliseconds since epoch
  demo        boolean not null default false, -- simulated data from "Naplnit demo daty"
  data        jsonb not null default '{}'
);
create index if not exists events_client_ts on events (client_id, ts);

-- Only the server (secret key) may touch these tables; the public anon key gets nothing.
alter table clients enable row level security;
alter table events enable row level security;

-- The two showcase sites.
insert into clients (id, name) values
  ('techmarket', 'TechMarket'),
  ('kavarna', 'Bohème')
on conflict (id) do nothing;
