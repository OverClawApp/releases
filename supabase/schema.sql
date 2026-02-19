-- OverClaw Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ═══════════════════════════════════════════
-- 1. PROFILES (extends Supabase auth.users)
-- ═══════════════════════════════════════════
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════
-- 2. SUBSCRIPTIONS (billing plans)
-- ═══════════════════════════════════════════
create type public.plan_tier as enum ('local', 'personal', 'pro', 'team', 'scale', 'enterprise');
create type public.billing_interval as enum ('monthly', 'annual');
create type public.subscription_status as enum ('active', 'cancelled', 'past_due', 'trialing', 'paused');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan plan_tier not null default 'local',
  billing_interval billing_interval default 'monthly',
  status subscription_status not null default 'active',
  scale_nodes int default 3,
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users can update own subscription"
  on public.subscriptions for update using (auth.uid() = user_id);
create policy "Users can insert own subscription"
  on public.subscriptions for insert with check (auth.uid() = user_id);

-- Auto-create subscription on signup (free local plan)
create or replace function public.handle_new_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'local', 'active');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_subscription();

-- ═══════════════════════════════════════════
-- 3. NODES (must come before bots due to FK)
-- ═══════════════════════════════════════════
create type public.node_type as enum ('personal', 'aws');
create type public.node_status as enum ('online', 'offline', 'provisioning', 'error');

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type node_type not null default 'personal',
  status node_status not null default 'offline',
  region text,
  ip_address text,
  capacity int default 5,
  last_heartbeat timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.nodes enable row level security;

create policy "Users can view own nodes"
  on public.nodes for select using (auth.uid() = user_id);
create policy "Users can insert own nodes"
  on public.nodes for insert with check (auth.uid() = user_id);
create policy "Users can update own nodes"
  on public.nodes for update using (auth.uid() = user_id);
create policy "Users can delete own nodes"
  on public.nodes for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 4. BOTS (cloud bots)
-- ═══════════════════════════════════════════
create type public.bot_status as enum ('running', 'stopped', 'error', 'deploying');

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  model text not null default 'claude-sonnet-4-20250514',
  system_prompt text,
  node_id uuid references public.nodes(id) on delete set null,
  status bot_status not null default 'stopped',
  budget_limit numeric(10,2),
  budget_used numeric(10,2) default 0,
  max_requests_per_day int,
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bots enable row level security;

create policy "Users can view own bots"
  on public.bots for select using (auth.uid() = user_id);
create policy "Users can insert own bots"
  on public.bots for insert with check (auth.uid() = user_id);
create policy "Users can update own bots"
  on public.bots for update using (auth.uid() = user_id);
create policy "Users can delete own bots"
  on public.bots for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 5. USAGE RECORDS (per-request tracking)
-- ═══════════════════════════════════════════
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid references public.bots(id) on delete set null,
  node_id uuid references public.nodes(id) on delete set null,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  cost numeric(10,6) default 0,
  request_type text default 'chat',
  created_at timestamptz default now()
);

alter table public.usage_records enable row level security;

create policy "Users can view own usage"
  on public.usage_records for select using (auth.uid() = user_id);
create policy "Users can insert own usage"
  on public.usage_records for insert with check (auth.uid() = user_id);

-- Index for fast usage queries
create index idx_usage_user_created on public.usage_records(user_id, created_at desc);
create index idx_usage_bot on public.usage_records(bot_id, created_at desc);

-- ═══════════════════════════════════════════
-- 6. INVOICES (billing history)
-- ═══════════════════════════════════════════
create type public.invoice_status as enum ('draft', 'paid', 'unpaid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text default 'usd',
  status invoice_status not null default 'draft',
  period_start timestamptz,
  period_end timestamptz,
  stripe_invoice_id text,
  line_items jsonb default '[]',
  created_at timestamptz default now()
);

alter table public.invoices enable row level security;

create policy "Users can view own invoices"
  on public.invoices for select using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 7. API KEYS (provider keys, encrypted)
-- ═══════════════════════════════════════════
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

alter table public.api_keys enable row level security;

create policy "Users can view own keys"
  on public.api_keys for select using (auth.uid() = user_id);
create policy "Users can insert own keys"
  on public.api_keys for insert with check (auth.uid() = user_id);
create policy "Users can update own keys"
  on public.api_keys for update using (auth.uid() = user_id);
create policy "Users can delete own keys"
  on public.api_keys for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 8. USAGE AGGREGATES (monthly summary view)
-- ═══════════════════════════════════════════
create or replace view public.monthly_usage as
select
  user_id,
  date_trunc('month', created_at) as month,
  count(*) as total_requests,
  sum(input_tokens) as total_input_tokens,
  sum(output_tokens) as total_output_tokens,
  sum(cost) as total_cost,
  count(distinct bot_id) as bots_used,
  count(distinct model) as models_used
from public.usage_records
group by user_id, date_trunc('month', created_at);

-- ═══════════════════════════════════════════
-- 9. UPDATED_AT TRIGGER (auto-update timestamps)
-- ═══════════════════════════════════════════
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.update_updated_at();
create trigger bots_updated_at before update on public.bots
  for each row execute function public.update_updated_at();
create trigger nodes_updated_at before update on public.nodes
  for each row execute function public.update_updated_at();
create trigger api_keys_updated_at before update on public.api_keys
  for each row execute function public.update_updated_at();
