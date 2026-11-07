# Planilla de pedidos automática

Cada 10 minutos la planilla **"El de Siempre - Pedidos y Detalle de Productos"** trae los pedidos nuevos de la web:

- **Pedidos**: una fila por pedido (queda ordenada de más nuevo a más viejo).
- **Detalle Items**: una fila por producto, con la categoría y las pizzas de cada pack.
- **Resumen Semanal** y **Resumen por Producto**: se agregan solas las semanas y los productos nuevos.
- Si cambiás el estado de un pedido en el panel de admin (En preparación, En camino, Entregado, Cancelado), se actualiza en la planilla.

No hace falta tocar la web ni Vercel: todo pasa entre Supabase y la planilla.

## Activarlo (una sola vez, ~5 minutos)

### 1. Supabase
1. Supabase → **SQL Editor** → New query.
2. Pegar todo `supabase/planilla.sql` → **Run**.
3. Abajo aparece una **clave** larga (letras y números). Copiarla.
   Si la perdés, se vuelve a ver con `select clave from planilla_config;`.

### 2. La planilla
1. Abrir la planilla → **Extensiones → Apps Script**.
2. Borrar lo que haya en `Código.gs` y pegar todo `apps-script/planilla-pedidos.js`. Guardar (💾).
3. Engranaje **Configuración del proyecto** (a la izquierda) → abajo, **Propiedades del script → Agregar propiedad**:
   - Propiedad: `CLAVE_PLANILLA`
   - Valor: la clave del paso 1.
   Guardar.
4. Volver a **Editor** (`< >`), elegir la función **`instalar`** arriba y apretar **Ejecutar**.
   Google pide permisos: elegir la cuenta → *Configuración avanzada* → *Ir a … (no seguro)* → **Permitir**.
   (Dice "no seguro" porque el script es tuyo y no está publicado; es normal.)
5. Listo: en ese momento trae los pedidos que falten desde el 30/10 y queda programado cada 10 minutos.

Al recargar la planilla aparece el menú **El de Siempre → Traer pedidos ahora** para no esperar los 10 minutos.

## Bueno saber
- Los pedidos que ya estaban cargados no se duplican (se reconocen por el número `#EDS-…`).
- Solo agrega pedidos del **30/10/2026 en adelante** (lo anterior se cargó a mano). Se cambia en `AGREGAR_DESDE`, al principio del script.
- El estado solo se pisa cuando en el panel se mueve a En preparación / En camino / Entregado / Cancelado. Si lo cambiás a mano en la planilla y el pedido sigue "Recibido" en el panel, se respeta lo de la planilla.
- Las filas cargadas a mano (por ejemplo `#EDS-MANUAL-01`) no se tocan.
- En **Descuento** va la suma de cupón + promos automáticas, y en **Cupón** el código y el nombre de la promo.
- `instalar` también estira las fórmulas de los resúmenes (llegaban hasta la semana del 26/10) para que cuenten las semanas siguientes.
- El teléfono de los clientes no se manda a la planilla.

## Si algo falla
Apps Script → **Ejecuciones** (a la izquierda) muestra cada corrida y el error:
- *Falta la propiedad CLAVE_PLANILLA*: repetir el paso 2.3.
- *Supabase respondió 404*: no se corrió `supabase/planilla.sql`.
- Corre bien pero no trae nada: revisar que la clave esté copiada completa, sin espacios.

Para apagarlo: Apps Script → **Activadores** (reloj) → borrar el de `sincronizarPedidos`.
