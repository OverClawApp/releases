-- Affiliate system for OverClaw
-- Run this in Supabase SQL editor

alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by text,
  add column if not exists affiliate_milestone_level int not null default 0;

create index if not exists idx_profiles_referred_by on public.profiles(referred_by);

create or replace function public.ensure_affiliate_code()
returns text
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  existing_code text;
  new_code text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select referral_code into existing_code
  from public.profiles
  where id = uid;

  if existing_code is not null and existing_code <> '' then
    return existing_code;
  end if;

  loop
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
    exit when not exists (select 1 from public.profiles where referral_code = new_code);
  end loop;

  update public.profiles
  set referral_code = new_code
  where id = uid;

  return new_code;
end;
$$;

create or replace function public.claim_affiliate_rewards()
returns jsonb
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  my_code text;
  referred_count int := 0;
  current_level int := 0;
  next_level int;
  total_tokens_awarded bigint := 0;
  unlocked_pro boolean := false;
  milestones int[] := array[1,5,10,25,50,100,500,1000];
  rewards bigint[] := array[1000,5000,10000,25000,50000,100000,500000,1000000];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  my_code := public.ensure_affiliate_code();

  select count(*)::int into referred_count
  from public.profiles
  where referred_by = my_code
    and id <> uid;

  select coalesce(affiliate_milestone_level, 0) into current_level
  from public.profiles
  where id = uid;

  next_level := current_level + 1;
  while next_level <= array_length(milestones, 1)
    and referred_count >= milestones[next_level]
  loop
    total_tokens_awarded := total_tokens_awarded + rewards[next_level];
    current_level := next_level;
    next_level := next_level + 1;
  end loop;

  if total_tokens_awarded > 0 then
    insert into public.token_balances (user_id, balance, total_purchased)
    values (uid, total_tokens_awarded, total_tokens_awarded)
    on conflict (user_id) do update
      set balance = public.token_balances.balance + excluded.balance,
          total_purchased = public.token_balances.total_purchased + excluded.total_purchased,
          updated_at = now();
  end if;

  if current_level >= 8 then
    unlocked_pro := true;
    insert into public.subscriptions (user_id, plan, status)
    values (uid, 'pro', 'active')
    on conflict (user_id) do update
      set plan = 'pro',
          status = 'active',
          updated_at = now();
  end if;

  update public.profiles
  set affiliate_milestone_level = current_level
  where id = uid;

  return jsonb_build_object(
    'referral_code', my_code,
    'referred_count', referred_count,
    'milestone_level', current_level,
    'tokens_awarded', total_tokens_awarded,
    'unlocked_pro_forever', unlocked_pro
  );
end;
$$;

create or replace function public.get_affiliate_invites()
returns table(invitee_id uuid, display_name text, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  my_code text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select referral_code into my_code
  from public.profiles
  where id = uid;

  if my_code is null or my_code = '' then
    return;
  end if;

  return query
  select p.id, coalesce(p.display_name, 'User'), p.created_at
  from public.profiles p
  where p.referred_by = my_code
    and p.id <> uid
  order by p.created_at desc;
end;
$$;

grant execute on function public.ensure_affiliate_code() to authenticated;
grant execute on function public.claim_affiliate_rewards() to authenticated;
grant execute on function public.get_affiliate_invites() to authenticated;
