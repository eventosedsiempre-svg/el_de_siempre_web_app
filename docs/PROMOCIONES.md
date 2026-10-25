# Promociones y cupones programables

## Qué hay de nuevo

- En el panel de admin hay una pestaña **Promociones** para crear, editar, pausar y borrar promos.
- Cada promo puede ser:
  - **Automática** (sin código): se aplica sola a los productos o al pedido. Ej.: "Semana del roque: Pizza Cebolla y roquefort 20% OFF".
  - **Cupón** (con código): el cliente escribe el código en el carrito. Ej.: "Día de la madre: MAMA20, 20% OFF en todo".
- Se prenden y se apagan solas según las fechas y los días que elijas (hora de Argentina).
- Si un producto tiene varias promos, se aplica la más conveniente para el cliente. Las promos no se suman entre sí.
- El cupón se aplica **encima** de la promo.
- El envío gratis (desde $150.000) se calcula con el precio final, con los descuentos incluidos.
- En el carrito y el checkout se ve el precio anterior tachado. El pedido guarda qué promo se usó y cuánto descontó.
- En la home aparece un cartel cuando hay promos activas. Los productos con promo llevan la etiqueta **PROMO**.
- Los precios de `js/data.js` no cambian, y los cupones de siempre (EDS10, PEDRO10) siguen funcionando.

## Admin

Tu usuario (eventosedsiempre@gmail.com) ya es admin desde la tanda de seguridad, así que no tenés que hacer nada. Para sumar otro admin, seguí los pasos de [SEGURIDAD.md](SEGURIDAD.md#para-sumar-otro-admin).

## Pasos para activarlo (en este orden)

### 1. Correr el SQL

1. Abrí [`supabase/promociones.sql`](../supabase/promociones.sql) y copiá todo.
2. En Supabase andá a **SQL Editor → New query**, pegalo y tocá **Run**.
3. Abajo tiene que aparecer una tabla con la columna "promociones" y el número 0.

El SQL solo agrega cosas: una tabla nueva y dos columnas nuevas en los pedidos. No borra ni cambia productos, usuarios ni pedidos. Si lo corrés dos veces no pasa nada.

### 2. Publicar

Aprobá (mergeá) el Pull Request. Vercel publica solo en uno o dos minutos.

## Cómo cargar una promo

Panel de admin → **Promociones** → **+ Nueva promo**.

| Campo | Qué poner |
|---|---|
| Nombre | Para vos, ej. "Día de la madre". |
| Texto que ve el cliente | Lo que sale en el cartel y en el carrito, ej. "20% OFF en todo". |
| Tipo | **Porcentaje** (20 = 20%), **monto fijo** (se descuenta por unidad, o una sola vez si es para todo el pedido) o **precio especial** (el producto pasa a costar eso). |
| ¿A qué se aplica? | Productos que elijas, una categoría o todo el pedido. El precio especial no vale para todo el pedido. |
| Desde / Hasta | Opcional. El "hasta" incluye ese día completo. Sin fechas, la promo vale siempre. |
| Días | Opcional. Ej.: marcá solo "Mié" para una promo de los miércoles. |
| Compra mínima | Opcional. Se mide con el subtotal sin descuentos. |
| Código de cupón | Opcional. Si lo completás, la promo no se aplica sola: el cliente tiene que escribir el código. |

Si cargás un código aparecen dos opciones más:
- **Un solo uso por cliente**: viene marcada.
- **Mostrar el código en el cartel de la home**: si no la marcás, el cupón es "secreto" y solo lo usa quien sabe el código.

Los cupones piden que el cliente tenga cuenta y haya iniciado sesión, igual que los de siempre.

### Ejemplos

- **Día de la madre**: código `MAMA20`, porcentaje 20, todo el pedido, del 17/10 al 19/10, mostrar en la home.
- **Semana del roque**: sin código, porcentaje 20, producto "Pizza Cebolla y roquefort", del lunes al domingo de esa semana.
- **Miércoles de muzza**: sin código, precio especial 9000, producto "Pizza Muzzarella", día miércoles, sin fechas.

**Pausar** apaga una promo sin borrarla. **Borrar** la elimina, pero los pedidos que ya la usaron no cambian.

## Cómo probarlo

1. Creá una promo automática para hoy (por ejemplo 10% en Pizza Muzzarella). En la home tiene que aparecer el cartel y en la tienda la etiqueta **PROMO** con el precio tachado.
2. Agregá esa pizza al carrito: tiene que verse el precio anterior tachado y una fila verde con el descuento. Lo mismo en el checkout.
3. Creá un cupón (por ejemplo `PRUEBA10`, 10% en todo). Con una cuenta de cliente, aplicalo en el carrito: se descuenta sobre el precio que ya tiene la promo.
4. Hacé un pedido. En **Mis pedidos → detalle** y en el panel → **Pedidos** se ve la promo, el cupón y el precio de cada producto.
5. Pausá las promos de prueba o borralas.
