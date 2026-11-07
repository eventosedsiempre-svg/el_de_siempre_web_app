-- ============================================================
-- PLANILLA DE PEDIDOS — deja que la planilla de Google lea los pedidos
-- Pegar todo en Supabase → SQL Editor → Run.
-- No borra ni modifica datos. Se puede correr más de una vez (la clave no cambia).
-- Al terminar muestra la CLAVE: copiarla en el Apps Script de la planilla
-- (pasos en docs/PLANILLA-PEDIDOS.md).
-- ============================================================

-- Clave secreta que tiene que mandar la planilla. Se genera acá adentro: no está en el repo.
create table if not exists public.planilla_config (
  id    integer primary key default 1 check (id = 1),
  clave text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
alter table public.planilla_config enable row level security;
-- Sin políticas: nadie la lee desde la web.
insert into public.planilla_config (id) values (1) on conflict (id) do nothing;

-- Devuelve los pedidos desde una fecha, solo si la clave es la correcta (si no, no devuelve nada).
-- No incluye el teléfono. "fecha" ya viene en hora de Argentina.
create or replace function public.pedidos_planilla(p_clave text, p_desde date)
returns setof jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id',              o.id,
    'fecha',           (o.created_at at time zone 'America/Argentina/Buenos_Aires')::date,
    'registrado',      o.user_id is not null,
    'cliente',         o.user_name,
    'email',           o.email,
    'estado',          o.status,
    'zona',            o.zone,
    'direccion',       o.direccion,
    'total',           o.total,
    'envio',           o.ship,
    'cupon',           o.coupon,
    'descuento',       o.discount,
    'promo_descuento', o.promo_descuento,
    'promos',          o.promos,
    'items',           o.items,
    'items_detalle',   o.items_detalle
  )
  from public.orders o
  where exists (select 1 from public.planilla_config c where c.clave = p_clave)
    and o.created_at >= p_desde
  order by o.created_at
$$;
revoke all on function public.pedidos_planilla(text, date) from public;
grant execute on function public.pedidos_planilla(text, date) to anon, authenticated;

-- La clave para pegar en la planilla:
select clave from public.planilla_config;
