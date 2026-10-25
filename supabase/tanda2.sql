-- ============================================================
-- TANDA 2 — cambios en la base de datos
-- Pegar todo en Supabase → SQL Editor → Run.
-- Solo AGREGA cosas: no borra ni modifica pedidos ni usuarios existentes.
-- Se puede correr más de una vez sin problema.
-- ============================================================

-- Mejora 2: detalle de productos con precio en los pedidos nuevos
-- (los pedidos viejos quedan con este campo vacío y se siguen leyendo del texto "items")
alter table public.orders add column if not exists items_detalle jsonb;

-- Mejora 3: direcciones guardadas de cada usuario
create table if not exists public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  calle          text not null,
  numero         text not null default '',
  piso_depto     text not null default '',
  localidad      text not null default '',
  referencia     text not null default '',
  zona           text not null default '',   -- clave de la zona de entrega (ver ZONAS en js/data.js)
  predeterminada boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists addresses_user_id_idx on public.addresses (user_id);

-- Cada usuario ve y cambia solo sus propias direcciones
alter table public.addresses enable row level security;
drop policy if exists "addresses_select_own" on public.addresses;
drop policy if exists "addresses_insert_own" on public.addresses;
drop policy if exists "addresses_update_own" on public.addresses;
drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_select_own" on public.addresses for select to authenticated using (auth.uid() = user_id);
create policy "addresses_insert_own" on public.addresses for insert to authenticated with check (auth.uid() = user_id);
create policy "addresses_update_own" on public.addresses for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "addresses_delete_own" on public.addresses for delete to authenticated using (auth.uid() = user_id);
