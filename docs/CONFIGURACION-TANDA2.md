# Configuración para la tanda 2 (cuenta de usuario y pedidos)

Pasos que hay que hacer **una sola vez**, fuera del código. No hace falta tocar nada en Vercel.

## 1. Envío de mails con Resend (para "Olvidé mi contraseña")

El envío de mails que trae Supabase de fábrica solo manda a los mails del equipo y tiene un límite muy bajo, así que usamos Resend (gratis hasta 3.000 mails por mes).

1. Creá una cuenta en https://resend.com
2. En **Domains → Add Domain** poné `eldesiempre.com`.
3. Resend te muestra 3 o 4 registros DNS (tipo TXT y MX). Cargalos donde administrás el dominio y esperá a que Resend diga **Verified** (puede tardar desde minutos hasta unas horas).
4. En **API Keys → Create API Key** creá una clave con permiso "Sending access" y copiala.
5. En Supabase: **Authentication → Emails → SMTP Settings**, activá **Enable Custom SMTP** y completá:
   - Sender email: `no-responder@eldesiempre.com`
   - Sender name: `El de Siempre`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: la clave que copiaste en el paso 4
6. Guardá.

## 2. URLs permitidas en Supabase

En **Authentication → URL Configuration**:

- **Site URL**: `https://eldesiempre.com`
- **Redirect URLs**: agregá estas tres
  - `https://eldesiempre.com/**`
  - `https://www.eldesiempre.com/**`
  - `http://localhost:5173/**` (para probar en la compu)

## 3. Vencimiento del link (1 hora)

En **Authentication → Providers → Email**, revisá que **Email OTP Expiration** diga `3600` (son segundos, o sea 1 hora).

## 4. Mail en español

En **Authentication → Emails → Templates → Reset Password**:

- **Subject**: `Creá tu contraseña nueva - El de Siempre`
- **Body** (pegá esto tal cual):

```html
<h2>Hola!</h2>
<p>Recibimos un pedido para cambiar la contraseña de tu cuenta en El de Siempre.</p>
<p><a href="{{ .ConfirmationURL }}">Tocá acá para crear tu contraseña nueva</a></p>
<p>El link vence en 1 hora. Si no fuiste vos, ignorá este mail: tu contraseña sigue igual.</p>
<p>— El de Siempre</p>
```

## 5. Cambios en la base de datos

1. Abrí el archivo [`supabase/tanda2.sql`](../supabase/tanda2.sql) y copiá todo su contenido.
2. En Supabase andá a **SQL Editor → New query**, pegalo y tocá **Run**.
3. Tiene que decir "Success". Solo agrega cosas, no cambia ni borra pedidos ni usuarios, y se puede correr más de una vez.

Conviene hacerlo **antes** de publicar los cambios. Si igual se publica antes, los pedidos se siguen guardando como hasta ahora (sin el precio por producto).
