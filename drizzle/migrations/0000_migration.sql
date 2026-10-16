create type public.app_role as enum ('admin','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,full_name) values (new.id,new.email,new.raw_user_meta_data->>'full_name');
  insert into public.user_roles(user_id,role) values (new.id,'user');
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id,role) values (new.id,'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.nishflow_portfolio_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  full_name text not null,
  profession_type text not null check (profession_type in ('Software Engineer','Designer','Manager/Consultant')),
  linkedin_url text,
  contact_number text,
  additional_requirements text,
  package_selected text not null check (package_selected in ('Basic Portfolio','Premium Interactive')),
  order_status text not null default 'Details Received' check (order_status in ('Details Received','Pending Payment Approval','In Progress','Completed')),
  rejection_reason text,
  live_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.nishflow_portfolio_orders to authenticated;
grant all on public.nishflow_portfolio_orders to service_role;
alter table public.nishflow_portfolio_orders enable row level security;
create policy "read own or admin" on public.nishflow_portfolio_orders for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "insert own" on public.nishflow_portfolio_orders for insert to authenticated with check (user_id=auth.uid());
create policy "admin update" on public.nishflow_portfolio_orders for update to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.order_insert_defaults() returns trigger language plpgsql as $$
begin new.order_status := 'Details Received'; new.rejection_reason := null; new.live_url := null; return new; end $$;
create trigger order_insert_defaults before insert on public.nishflow_portfolio_orders for each row execute function public.order_insert_defaults();

create table public.nishflow_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.nishflow_portfolio_orders(id) on delete cascade,
  user_id uuid not null,
  receipt_image_url text not null,
  uploaded_at timestamptz not null default now(),
  payment_status text not null default 'Pending Verification' check (payment_status in ('Pending Verification','Approved','Rejected'))
);
grant select, insert, update on public.nishflow_order_payments to authenticated;
grant all on public.nishflow_order_payments to service_role;
alter table public.nishflow_order_payments enable row level security;
create policy "read own or admin" on public.nishflow_order_payments for select to authenticated using (user_id=auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "insert own" on public.nishflow_order_payments for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.nishflow_portfolio_orders o where o.id=order_id and o.user_id=auth.uid() and o.order_status='Details Received'));
create policy "admin update" on public.nishflow_order_payments for update to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.payment_after_insert() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.nishflow_portfolio_orders set order_status='Pending Payment Approval', rejection_reason=null where id=new.order_id;
  return new;
end $$;
create trigger payment_after_insert after insert on public.nishflow_order_payments for each row execute function public.payment_after_insert();

create or replace function public.payment_before_insert() returns trigger language plpgsql as $$
begin new.payment_status := 'Pending Verification'; new.uploaded_at := now(); return new; end $$;
create trigger payment_before_insert before insert on public.nishflow_order_payments for each row execute function public.payment_before_insert();

create or replace function public.payment_after_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payment_status='Approved' and old.payment_status<>'Approved' then
    update public.nishflow_portfolio_orders set order_status='In Progress', rejection_reason=null where id=new.order_id;
  end if;
  return new;
end $$;
create trigger payment_after_update after update on public.nishflow_order_payments for each row execute function public.payment_after_update();

alter publication supabase_realtime add table public.nishflow_portfolio_orders;
alter publication supabase_realtime add table public.nishflow_order_payments;

create policy "upload own receipts" on storage.objects for insert to authenticated with check (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "read own receipts or admin" on storage.objects for select to authenticated using (bucket_id='receipts' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_role(auth.uid(),'admin')));