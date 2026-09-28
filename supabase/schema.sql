-- AI prodavač – database schema. Run in Supabase → SQL Editor → Run.
-- Safe to run again (also after updates): it only adds what is missing.

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

-- What the shop sells and how it works (added in v2 – safe to run on an existing database).
alter table clients add column if not exists description text;          -- e.g. 'e-shop s elektronikou' – tells the AI what kind of shop it is
alter table clients add column if not exists feed_url text;             -- Heureka / Zboží.cz / Google Merchant XML feed with the products
alter table clients add column if not exists info jsonb;                -- topic → text, e.g. {"doprava": "...", "vraceni": "...", "platba": "...", "kontakt": "..."}
alter table clients add column if not exists free_shipping_from integer; -- free delivery threshold in Kč (empty = none)
alter table clients add column if not exists integration jsonb;         -- optional fixes for unusual sites: {"addToCart": "css", "cart": "css", "thankYou": "regex"}

-- The last downloaded product feed per client, so a fresh server doesn't have to download it again.
create table if not exists catalogs (
  client_id     text primary key references clients(id) on delete cascade,
  data          jsonb,
  product_count integer,
  error         text,                              -- why the last download failed (the previous catalog stays in use)
  updated_at    timestamptz not null default now()
);

-- Only the server (secret key) may touch these tables; the public anon key gets nothing.
alter table clients enable row level security;
alter table events enable row level security;
alter table catalogs enable row level security;

-- The two showcase sites.
insert into clients (id, name) values
  ('techmarket', 'TechMarket'),
  ('kavarna', 'Bohème')
on conflict (id) do nothing;
