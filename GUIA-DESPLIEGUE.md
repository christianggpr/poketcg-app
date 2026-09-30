# Guía para poner PokéTCG en línea (Fase 1)

Sigue los pasos en orden. Cada uno se hace una sola vez. Las claves secretas **nunca** se pegan en el chat
ni en el repositorio: solo en el archivo `claves.env` de tu PC y en la configuración de Vercel.

---

## Paso 1 · Supabase (base de datos y cuentas)

1. Entra a https://supabase.com/dashboard y abre tu proyecto (región São Paulo).
2. **Crear las tablas:** menú izquierdo → **SQL Editor** → **New query** → abre en tu PC el archivo
   `supabase/migrations/0001_fase1.sql` (está en este repositorio), copia TODO su contenido, pégalo y pulsa
   **Run**. Debe terminar con "Success. No rows returned". Si lo ejecutas dos veces no pasa nada malo.
3. **Cuentas por correo:** menú **Authentication → Sign In / Providers → Email**: deja activado
   **Enable Email provider** y **Confirm email** (así nadie entra sin verificar su correo). Guarda.
4. **Direcciones permitidas:** **Authentication → URL Configuration**:
   - Site URL: `https://poketcg.pe`
   - Redirect URLs: añade `https://poketcg.pe/**`
5. **Copiar las claves:** **Project Settings → API**:
   - `Project URL` → línea `NEXT_PUBLIC_SUPABASE_URL=` de `claves.env`
   - `anon public` → línea `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
   - `service_role` (pulsa "Reveal") → línea `SUPABASE_SERVICE_ROLE_KEY=` ← **secreta**

> Los correos de verificación y de recuperación los envía la propia app con Resend (paso 2), con textos en
> español. No hace falta configurar SMTP ni plantillas en Supabase.

## Paso 2 · Resend (envío de correos)

1. Entra a https://resend.com → **Domains → Add domain** → escribe `poketcg.pe` → región "South America (São Paulo)"
   si te la ofrece → **Add**.
2. Resend te muestra 3 registros DNS (un **TXT** de DKIM `resend._domainkey`, y un **MX** + un **TXT** para el
   subdominio `send`). Cópialos en GoDaddy: **Mi cuenta → Dominios → poketcg.pe → DNS → Agregar registro**.
   No tocan el correo de GoDaddy (`info@poketcg.pe`) porque usan subdominios propios.
3. Vuelve a Resend y pulsa **Verify**. Puede tardar de 5 minutos a unas horas.
4. **API Keys → Create API Key**: nombre `poketcg-app`, permiso **Sending access**, dominio `poketcg.pe` →
   copia la clave (empieza con `re_`) → línea `RESEND_API_KEY=` de `claves.env` ← **secreta**. Solo se ve una vez.

## Paso 3 · Vercel (publicar la app)

1. Entra a https://vercel.com → **Add New… → Project** → **Import** el repositorio `christianggpr/poketcg-app`
   (si no aparece, "Adjust GitHub App Permissions" y dale acceso a ese repositorio).
2. Framework: se detecta **Next.js** solo. No cambies nada más.
3. Abre **Environment Variables** y añade estas (nombre → valor que tienes en `claves.env`):

   | Nombre | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave anon public |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role (secreta) |
   | `RESEND_API_KEY` | la clave de Resend (secreta) |
   | `NEXT_PUBLIC_APP_URL` | `https://poketcg.pe` |
   | `EMAIL_FROM` | `PokéTCG <no-reply@poketcg.pe>` |
   | `ADMIN_EMAIL` | `info@poketcg.pe` |

4. Pulsa **Deploy**. En 2–3 minutos verás la app en una dirección tipo `poketcg-app-xxxx.vercel.app`.
5. **Dominio:** **Settings → Domains → Add** → `poketcg.pe` (y también `www.poketcg.pe`). Vercel te dirá qué poner
   en GoDaddy (DNS de poketcg.pe):
   - registro **A** con nombre `@` y valor `76.76.21.21`
   - registro **CNAME** con nombre `www` y valor `cname.vercel-dns.com`

   Si GoDaddy ya tiene un registro A `@` "Parked" o "WebsiteBuilder", edítalo en vez de crear otro.
   Cuando Vercel muestre "Valid Configuration", la app estará en https://poketcg.pe (puede tardar hasta 1 hora).

> Cada vez que yo suba cambios al repositorio, Vercel vuelve a publicar la app sola (1–3 minutos). No hay que
> hacer nada.

## Paso 4 · Primer uso (tú, como administrador)

1. Abre https://poketcg.pe → **Crear cuenta** con `info@poketcg.pe` (y tu DNI, celular, usuario y contraseña).
2. Revisa el correo (también la carpeta de spam) y pulsa **Confirmar mi correo**. Entrarás a la app.
3. Hazte administrador: Supabase → **SQL Editor** → pega el contenido de `supabase/admin/hacer-admin.sql` → **Run**.
   Recarga la app: arriba a la derecha aparece el enlace **Admin**.
4. Entra a https://poketcg.pe/admin → **Cargar catálogo en la base de datos** (1–3 minutos, no cierres la
   pestaña). Esto copia las 34 498 cartas al servidor. Hay que repetirlo cuando publique un catálogo nuevo.
5. **Ajustes → Importar respaldo de PokéBóveda v1** → elige `pokeboveda-respaldo-2026-09-30.json` →
   **Combinar** (o Reemplazar). Tus cajas y cartas aparecen con sus posiciones.

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| Al registrarte: "La cuenta se creó, pero no se pudo enviar el correo…" | `RESEND_API_KEY` en Vercel, y que el dominio esté **Verified** en Resend. Luego, en Ingresar, usa "Reenviar correo de verificación". |
| "Falta configurar SUPABASE_SERVICE_ROLE_KEY" | Añade la variable en Vercel → **Redeploy** (Deployments → ⋯ → Redeploy). |
| El enlace del correo te manda a "El enlace no es válido" | Ya se usó o venció (1 hora para recuperar contraseña). Pide otro. |
| "Falta tu perfil" al entrar | La migración SQL se ejecutó después de crear la cuenta. Ejecútala y crea la cuenta de nuevo (o escríbeme). |
| No aparece **Admin** | Ejecuta `hacer-admin.sql` con el correo exacto de tu cuenta y recarga. |
| Guardar una carta da error | Falta cargar el catálogo (paso 4.4). |
| Correos van a spam | Normal los primeros días. Verifica que los 3 registros DNS de Resend estén correctos. |

## Cambiar el nombre visible de la app

Si prefieres "PokéBóveda" en vez de "PokéTCG": el nombre está en un solo lugar, `src/lib/config.ts`
(`APP_NAME`). Pídemelo y lo cambio (aparece en la app, en los correos y en el icono de la pantalla de inicio).
