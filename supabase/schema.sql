-- AI prodavač – database schema. Run in Supabase → SQL Editor → Run.
-- Safe to run again (also after updates): it only adds what is missing.

-- One row per shop that uses the AI salesperson.
create table if not exists clients (
  id          text primary key,              -- used in the embed: data-client="id"
  name        text not null,                 -- shop name shown in the dashboard
  domains     text[] not null default '{}',  -- where the widget may run, e.g. {kavarna-boheme.cz}
  agent_name  text,                          -- fixed name of the AI (empty = derived from the brand)
  admin_token text,                          -- legacy plain-text password; replaced by password_hash on first login
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
  demo        boolean not null default false, -- legacy: simulated data (no longer created)
  data        jsonb not null default '{}'
);
create index if not exists events_client_ts on events (client_id, ts);

-- What the shop sells and how it works (added in v2 – safe to run on an existing database).
alter table clients add column if not exists description text;          -- e.g. 'e-shop s elektronikou' – tells the AI what kind of shop it is
alter table clients add column if not exists feed_url text;             -- Heureka / Zboží.cz / Google Merchant XML feed with the products
alter table clients add column if not exists info jsonb;                -- topic → text, e.g. {"doprava": "...", "vraceni": "...", "platba": "...", "kontakt": "..."}
alter table clients add column if not exists free_shipping_from integer; -- free delivery threshold in Kč (empty = none)
alter table clients add column if not exists integration jsonb;         -- optional fixes for unusual sites: {"addToCart": "css", "cart": "css", "thankYou": "regex"}

-- Logins, plans and contact (v3).
alter table clients add column if not exists password_hash text;         -- the shop owner's dashboard password (scrypt, never plain text)
alter table clients add column if not exists plan text not null default 'trial'; -- see lib/plans.js
alter table clients add column if not exists monthly_message_limit integer;      -- overrides the plan's limit (empty = plan default)
alter table clients add column if not exists owner_email text;           -- where login details and alerts for the owner go
alter table clients add column if not exists notes text;                 -- internal notes (contract, contact person…)

-- Self sign-up and payments through Stripe (v4). See lib/billing.js.
alter table clients add column if not exists billing_status text not null default 'manual'; -- manual | unpaid | active | past_due | canceled
alter table clients add column if not exists stripe_customer_id text;
alter table clients add column if not exists stripe_subscription_id text;
alter table clients add column if not exists paid_until timestamptz;     -- end of the period paid for
create index if not exists clients_stripe_customer on clients (stripe_customer_id);

-- Proof of agreeing to the terms at sign-up (v5): which version, when and from which IP address.
alter table clients add column if not exists terms_version text;
alter table clients add column if not exists terms_accepted_at timestamptz;
alter table clients add column if not exists terms_accepted_ip text;

-- The shop owner customises the assistant (v6): its look and its manner. See lib/bot.js.
alter table clients add column if not exists appearance jsonb;  -- {"color","theme","avatar":"auto|letter|image","letter","avatarColor","image"(data URL)}
alter table clients add column if not exists persona jsonb;     -- {"tone":"friendly|professional|playful","gender":"f|m","instructions":"…"}

-- The owner asks us to put the embed code on their website for them (v7): {"platform","contact","note","at","doneAt"}.
alter table clients add column if not exists install_request jsonb;
-- The widget has started on the shop's own website (v8): {"host","at","first"} – the setup steps show it.
alter table clients add column if not exists widget_seen jsonb;
-- How the widget looks on the shop's own website (v9): the colours, mascot and name it worked out there.
-- The settings page's preview shows them instead of a sample page's.
alter table clients add column if not exists site_look jsonb;

-- The owner confirmed their e-mail address (v10). Accounts from before e-mails were checked count as confirmed
-- (the date is fixed, so running this file again never confirms a newer account).
alter table clients add column if not exists email_verified_at timestamptz;
update clients set email_verified_at = created_at where email_verified_at is null and created_at < '2026-10-27T12:00:00Z';

-- What the owner wants the assistant to know beyond the catalogue: texts and uploaded documents.
create table if not exists knowledge (
  id          bigint generated always as identity primary key,
  client_id   text not null references clients(id) on delete cascade,
  title       text not null,
  filename    text,
  text        text not null,
  chars       integer not null,
  created_at  timestamptz not null default now()
);
create index if not exists knowledge_client on knowledge (client_id);

-- The last downloaded product feed per client. The products themselves live gzipped in the
-- private Storage bucket "catalogs" (<client_id>.json.gz); this row only describes them.
create table if not exists catalogs (
  client_id     text primary key references clients(id) on delete cascade,
  data          jsonb,                             -- legacy: products stored inline (read once, then moved to Storage)
  product_count integer,
  error         text,                              -- why the last download failed (the previous catalog stays in use)
  updated_at    timestamptz not null default now()
);
alter table catalogs add column if not exists stored_at timestamptz;     -- when the products were last written to Storage
insert into storage.buckets (id, name, public) values ('catalogs', 'catalogs', false) on conflict (id) do nothing;

-- AI usage per client and month – the basis for plan limits and invoicing.
create table if not exists usage (
  client_id          text not null references clients(id) on delete cascade,
  month              text not null,               -- 'YYYY-MM' (UTC)
  messages           integer not null default 0,  -- customer messages answered by the AI
  ai_calls           integer not null default 0,  -- all Claude requests (chat rounds, help offers, owner insights)
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  tts_chars          bigint not null default 0,   -- characters read aloud by the natural voice
  cost_usd           numeric(12, 4) not null default 0,
  primary key (client_id, month)
);

-- Adds to a client's usage for a month atomically; returns the new totals.
create or replace function add_usage(
  p_client text, p_month text, p_messages integer default 0, p_ai_calls integer default 0,
  p_input bigint default 0, p_output bigint default 0, p_cache_read bigint default 0, p_cache_write bigint default 0,
  p_tts bigint default 0, p_cost numeric default 0
) returns usage language sql as $$
  insert into usage as u (client_id, month, messages, ai_calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, tts_chars, cost_usd)
  values (p_client, p_month, p_messages, p_ai_calls, p_input, p_output, p_cache_read, p_cache_write, p_tts, p_cost)
  on conflict (client_id, month) do update set
    messages = u.messages + excluded.messages,
    ai_calls = u.ai_calls + excluded.ai_calls,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    tts_chars = u.tts_chars + excluded.tts_chars,
    cost_usd = u.cost_usd + excluded.cost_usd
  returning *;
$$;

-- Request counters shared by every server instance (rate limits, "alert only once" flags).
create table if not exists rate_limits (
  key          text primary key,
  window_start bigint not null,   -- ms since epoch
  count        integer not null
);

-- Counts one hit for `p_key` in a fixed window; true = still within `p_max`.
create or replace function hit_rate_limit(p_key text, p_window_ms bigint, p_max integer)
returns boolean language sql as $$
  with now_ms as (select (extract(epoch from clock_timestamp()) * 1000)::bigint as t)
  insert into rate_limits as r (key, window_start, count)
  select p_key, t, 1 from now_ms
  on conflict (key) do update set
    count = case when r.window_start <= (select t from now_ms) - p_window_ms then 1 else r.count + 1 end,
    window_start = case when r.window_start <= (select t from now_ms) - p_window_ms then (select t from now_ms) else r.window_start end
  returning count <= p_max;
$$;

-- Everything the owner dashboard shows, added up in the database (product names are filled in by the server).
create or replace function dashboard_summary(p_client text, p_since bigint)
returns jsonb language sql stable as $$
with ev as (
  select session_id, type, ts, data from events where client_id = p_client and ts >= p_since
),
ai as (
  select distinct session_id from ev
  where session_id is not null and type in ('offer_accepted', 'assistant_opened', 'nudge_clicked', 'chat_message')
),
buyers as (select distinct session_id from ev where type = 'purchase' and session_id is not null),
purchases as (
  select coalesce((data->>'value')::numeric, 0) as value, session_id in (select session_id from ai) as with_ai
  from ev where type = 'purchase'
),
t as (
  select
    (select count(*) from ev) as events,
    (select count(distinct session_id) from ev) as sessions,
    (select count(*) from ai) as ai_sessions,
    (select count(*) from ev where type = 'chat_message') as user_messages,
    (select count(*) from purchases) as orders,
    (select coalesce(sum(value), 0) from purchases) as revenue,
    (select count(*) from purchases where with_ai) as orders_ai,
    (select coalesce(sum(value), 0) from purchases where with_ai) as revenue_ai,
    (select count(*) from buyers where session_id in (select session_id from ai)) as buyers_ai,
    (select count(*) from buyers) as buyers_all
),
views as (select data->>'productId' as id, count(*) as n from ev where type = 'product_view' and data ? 'productId' group by 1),
carts as (
  select data->>'productId' as id, coalesce(data->>'source', '') = 'ai' as by_ai, sum(coalesce((data->>'quantity')::int, 1)) as n
  from ev where type = 'add_to_cart' and data ? 'productId' group by 1, 2
),
searches as (
  select lower(trim(data->>'query')) as q, coalesce((data->>'results')::int, 0) as results
  from ev where type = 'search' and coalesce(trim(data->>'query'), '') <> ''
),
recs as (
  select id, count(*) as n from ev, jsonb_array_elements_text(coalesce(data->'productIds', '[]'::jsonb)) as id
  where type = 'ai_recommended' group by 1
),
nudges as (
  select data->>'kind' as kind,
    count(*) filter (where type = 'nudge_shown') as shown,
    count(*) filter (where type = 'nudge_clicked') as clicked,
    count(*) filter (where type = 'nudge_dismissed') as dismissed
  from ev where type in ('nudge_shown', 'nudge_clicked', 'nudge_dismissed') group by 1
)
select jsonb_build_object(
  'totals', (select jsonb_build_object(
    'events', events, 'sessions', sessions, 'aiSessions', ai_sessions, 'userMessages', user_messages,
    'orders', orders, 'revenue', revenue, 'ordersAi', orders_ai, 'revenueAi', revenue_ai,
    'buyersAi', buyers_ai, 'buyersNonAi', buyers_all - buyers_ai) from t),
  'offer', jsonb_build_object(
    'shown', (select count(*) from ev where type = 'offer_shown'),
    'chat', (select count(*) from ev where type = 'offer_accepted' and coalesce(data->>'mode', '') <> 'voice'),
    'voice', (select count(*) from ev where type = 'offer_accepted' and data->>'mode' = 'voice'),
    'declined', (select count(*) from ev where type = 'offer_declined'),
    'reopened', (select count(*) from ev where type = 'assistant_opened')),
  'nudges', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'shown', shown, 'clicked', clicked, 'dismissed', dismissed) order by shown desc, kind) from nudges), '[]'),
  'topViewed', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'count', n) order by n desc, id) from (select * from views order by n desc, id limit 8) x), '[]'),
  'topSearches', coalesce((select jsonb_agg(jsonb_build_object('id', q, 'count', n) order by n desc, q) from (select q, count(*) as n from searches group by q order by n desc, q limit 8) x), '[]'),
  'searchMisses', coalesce((select jsonb_agg(jsonb_build_object('id', q, 'count', n) order by n desc, q) from (select q, count(*) as n from searches where results = 0 group by q order by n desc, q limit 6) x), '[]'),
  'topRecommended', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'count', n) order by n desc, id) from (select * from recs order by n desc, id limit 8) x), '[]'),
  'addToCartAi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'count', n) order by n desc, id) from (select id, n from carts where by_ai order by n desc, id limit 8) x), '[]'),
  'addToCartManual', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'count', n) order by n desc, id) from (select id, sum(n) as n from carts where not by_ai group by id order by n desc, id limit 8) x), '[]'),
  'viewedNotBought', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'views', v, 'carts', c) order by v desc, id) from (
    select views.id, views.n as v, coalesce((select sum(n) from carts where carts.id = views.id), 0) as c
    from views where views.n >= 3 and coalesce((select sum(n) from carts where carts.id = views.id), 0)::numeric / views.n < 0.15
    order by views.n desc, views.id limit 5) x), '[]'),
  'recentQuestions', coalesce((select jsonb_agg(jsonb_build_object('ts', ts, 'text', data->>'text', 'mode', data->>'mode') order by ts desc) from (
    select ts, data from ev where type = 'chat_message' and coalesce(data->>'text', '') <> '' order by ts desc limit 40) x), '[]')
);
$$;

-- Only the server (secret key) may touch these tables; the public anon key gets nothing.
alter table clients enable row level security;
alter table events enable row level security;
alter table catalogs enable row level security;
alter table usage enable row level security;
alter table rate_limits enable row level security;
alter table knowledge enable row level security;
revoke execute on function add_usage, hit_rate_limit, dashboard_summary from public, anon, authenticated;

-- The simulated "demo data" is gone from the app – remove what was generated earlier.
delete from events where demo;

-- The two showcase sites.
insert into clients (id, name, plan) values
  ('techmarket', 'TechMarket', 'internal'),
  ('kavarna', 'Bohème', 'internal')
on conflict (id) do nothing;
