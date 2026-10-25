-- ============================================================
-- SEGURIDAD — cerrar el acceso público a pedidos, perfiles y consultas
-- Pegar todo en Supabase → SQL Editor → Run.
-- No borra ni modifica datos: solo cambia QUIÉN puede leer y escribir cada tabla.
-- Se puede correr más de una vez sin problema.
--
-- ANTES de correrlo:
--   1. Crear el usuario admin en Authentication → Users → Add user → Create new user
--      (mail + contraseña, con "Auto Confirm User" tildado).
--   2. Reemplazar CAMBIAR@MAIL.COM (al final de este archivo) por ese mail.
-- ============================================================

-- ----- Admins -----
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- Sin políticas: nadie lee ni escribe esta tabla desde la web. Se maneja solo desde Supabase.

-- ¿El usuario con sesión es admin? (security definer: puede leer admins aunque la web no)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ----- Borrar los permisos viejos (abiertos) de estas tablas -----
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('orders', 'profiles', 'catering_leads', 'mayorista_leads')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ----- Pedidos -----
-- Cada cliente ve sus pedidos; el admin ve y cambia todos.
-- Cualquiera puede crear un pedido (también sin cuenta), pero solo a su nombre o como invitado.
alter table public.orders enable row level security;
create policy "orders_select_own_or_admin" on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "orders_insert_guest_or_own" on public.orders for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "orders_update_admin" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----- Perfiles -----
alter table public.profiles enable row level security;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ----- Consultas de eventos y revendedores -----
-- Cualquiera puede mandar una consulta; solo el admin las lee.
alter table public.catering_leads enable row level security;
create policy "catering_insert_all" on public.catering_leads for insert to anon, authenticated with check (true);
create policy "catering_select_admin" on public.catering_leads for select to authenticated using (public.is_admin());

alter table public.mayorista_leads enable row level security;
create policy "mayorista_insert_all" on public.mayorista_leads for insert to anon, authenticated with check (true);
create policy "mayorista_select_admin" on public.mayorista_leads for select to authenticated using (public.is_admin());

-- ----- Dar acceso de admin (reemplazá el mail) -----
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('CAMBIAR@MAIL.COM')
on conflict do nothing;

-- Control: tiene que mostrar el mail del admin. Si sale vacío, revisá el mail de arriba.
select u.email as admin from public.admins a join auth.users u on u.id = a.user_id;
