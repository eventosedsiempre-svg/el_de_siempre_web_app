-- ============================================================
-- TANDA 3 — promociones y cupones programables
-- Pegar todo en Supabase → SQL Editor → Run.
-- Solo AGREGA cosas: no borra ni modifica productos, usuarios ni pedidos existentes.
-- Se puede correr más de una vez sin problema.
-- Necesita que ya esté corrido supabase/seguridad.sql (usa la función is_admin).
-- ============================================================

-- ----- Promociones -----
-- Sin código: se aplica sola en los productos / el pedido mientras esté vigente.
-- Con código: es un cupón (ej. MAMA20) que el cliente escribe en el carrito.
create table if not exists public.promociones (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  texto      text not null default '',               -- lo que ve el cliente, ej. "20% OFF en muzzas"
  codigo     text,                                    -- vacío = promo automática; con valor = cupón
  tipo       text not null check (tipo in ('porcentaje', 'monto', 'precio')),
  valor      numeric not null check (valor > 0),      -- 20 = 20% · $ de descuento · $ precio especial
  aplica     text not null check (aplica in ('productos', 'categoria', 'pedido')),
  productos  integer[] not null default '{}',         -- ids de js/data.js (cuando aplica = productos)
  categoria  text not null default '',                -- ej. PIZZAS (cuando aplica = categoria)
  desde      date,                                    -- vacío = desde ya
  hasta      date,                                    -- vacío = sin vencimiento (incluye el día completo)
  dias       integer[] not null default '{}',         -- 0 = domingo … 6 = sábado; vacío = todos los días
  minimo     numeric not null default 0,              -- monto mínimo de compra (subtotal sin promos)
  un_uso     boolean not null default true,           -- cupones: una sola vez por cliente
  anunciar   boolean not null default false,          -- cupones: mostrar el código en la home
  pausada    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists promociones_codigo_idx on public.promociones (upper(codigo)) where codigo is not null;

-- Cualquiera ve las promos automáticas y los cupones anunciados (la web las tiene que mostrar).
-- Los cupones no anunciados no se pueden listar: solo se validan escribiendo el código (validar_cupon).
-- Solo el admin crea, cambia y borra.
alter table public.promociones enable row level security;
drop policy if exists "promociones_select_publicas" on public.promociones;
drop policy if exists "promociones_select_admin"    on public.promociones;
drop policy if exists "promociones_insert_admin"    on public.promociones;
drop policy if exists "promociones_update_admin"    on public.promociones;
drop policy if exists "promociones_delete_admin"    on public.promociones;
create policy "promociones_select_publicas" on public.promociones for select to anon, authenticated
  using (not pausada and (codigo is null or anunciar));
create policy "promociones_select_admin" on public.promociones for select to authenticated using (public.is_admin());
create policy "promociones_insert_admin" on public.promociones for insert to authenticated with check (public.is_admin());
create policy "promociones_update_admin" on public.promociones for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "promociones_delete_admin" on public.promociones for delete to authenticated using (public.is_admin());

-- Busca un cupón por su código (sin importar mayúsculas). Las fechas y días los revisa la web.
create or replace function public.validar_cupon(p_codigo text)
returns setof public.promociones
language sql stable security definer set search_path = public
as $$ select * from public.promociones where codigo is not null and upper(codigo) = upper(trim(p_codigo)) and not pausada limit 1 $$;
revoke all on function public.validar_cupon(text) from public;
grant execute on function public.validar_cupon(text) to anon, authenticated;

-- ----- Pedidos: qué promo se aplicó y cuánto descontó -----
-- (los pedidos viejos quedan con 0 / vacío)
alter table public.orders add column if not exists promo_descuento integer not null default 0;
alter table public.orders add column if not exists promos text;

-- Control: tiene que mostrar una tabla con la cantidad de promos (0 la primera vez)
select count(*) as promociones from public.promociones;
