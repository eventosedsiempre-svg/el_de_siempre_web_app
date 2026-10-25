-- ============================================================
-- TANDA 2 — cambios en la base de datos
-- Pegar todo en Supabase → SQL Editor → Run.
-- Solo AGREGA cosas: no borra ni modifica pedidos ni usuarios existentes.
-- Se puede correr más de una vez sin problema.
-- ============================================================

-- Mejora 2: detalle de productos con precio en los pedidos nuevos
-- (los pedidos viejos quedan con este campo vacío y se siguen leyendo del texto "items")
alter table public.orders add column if not exists items_detalle jsonb;
