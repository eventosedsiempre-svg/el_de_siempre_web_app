# Cerrar el acceso público a pedidos y perfiles

## El problema

La clave de Supabase que está dentro de la web es pública, y la base estaba abierta: con esa clave cualquiera podía leer todos los pedidos, los perfiles (mails y teléfonos) y las consultas de eventos. El panel de admin se protegía solo con una contraseña que se revisaba en el navegador.

## Cómo queda

- Cada cliente ve **solo sus pedidos, su perfil y sus direcciones**.
- Cualquiera puede **hacer un pedido o mandar una consulta**, también sin cuenta, pero no puede leer los de otros.
- El **admin entra con mail y contraseña** de un usuario de Supabase marcado como admin, y es el único que ve todo y cambia estados.

## Pasos (en este orden)

> Antes tiene que estar publicada la tanda 2 (rama `mejoras-web-tanda2`).

### 1. Crear tu usuario admin

En Supabase andá a **Authentication → Users → Add user → Create new user**:
- Email: el mail con el que vas a entrar al panel.
- Password: una contraseña nueva y segura (no la vieja del panel).
- Tildá **Auto Confirm User**.

Si ya tenés una cuenta de cliente con ese mail, no hace falta crearla: se usa esa.

### 2. Publicar este cambio

Aprobar (mergear) el Pull Request. Vercel publica solo en uno o dos minutos.

Desde acá hasta el paso 3, el panel de admin dice "El acceso de admin todavía no está activado". La tienda sigue funcionando normal.

### 3. Correr el SQL

1. Abrí [`supabase/seguridad.sql`](../supabase/seguridad.sql).
2. Al final del archivo reemplazá `CAMBIAR@MAIL.COM` por el mail del paso 1 (dejá las comillas).
3. En Supabase andá a **SQL Editor → New query**, pegá todo y tocá **Run**.
4. Abajo tiene que aparecer una tabla con tu mail en la columna "admin". Si sale vacía, revisá que el mail esté bien escrito y volvé a correrlo.

No borra ni cambia datos: solo define quién puede ver qué.

### 4. Probar

- Entrá a la web → **Admin** → tu mail y contraseña: tenés que ver pedidos, clientes y consultas.
- Entrá con una cuenta de cliente → **Mis pedidos**: ves solo los tuyos.
- Hacé un pedido sin cuenta: se tiene que guardar y aparecer en el panel.

## Para sumar otro admin

Crear su usuario (paso 1) y correr en el SQL Editor, con su mail:

```sql
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('otro@mail.com')
on conflict do nothing;
```

Para sacarle el acceso: `delete from public.admins where user_id = (select id from auth.users where email = 'otro@mail.com');`
