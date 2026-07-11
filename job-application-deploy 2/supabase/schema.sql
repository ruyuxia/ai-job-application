create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  customer_id text unique not null,
  resume_text text default '',
  preferences jsonb default '{}'::jsonb,
  parsed_profile jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  company text default '',
  title text default '',
  location text default '',
  language text default '',
  source_url text default '',
  official_url text default '',
  jd_text text default '',
  status text default 'lead',
  verification_status text default 'unverified',
  fit_score numeric,
  analysis jsonb,
  official_verification jsonb,
  next_action text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  email_text text default '',
  email_type text default 'update',
  email_summary text default '',
  next_action text default '',
  created_at timestamptz default now()
);

create index if not exists idx_jobs_customer_id_created_at on jobs(customer_id, created_at desc);
create index if not exists idx_email_events_customer_id_created_at on email_events(customer_id, created_at desc);

alter table profiles enable row level security;
alter table jobs enable row level security;
alter table email_events enable row level security;

-- MVP 使用服务端 service role 访问。正式多用户版本应改为 Supabase Auth + 用户级 RLS。
