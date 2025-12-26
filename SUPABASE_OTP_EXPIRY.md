# Configuración de Expiración de Magic Links (OTP)

Este documento explica cómo configurar el tiempo de expiración de los magic links (OTP) tanto en desarrollo local como en producción.

## Problema

Los magic links pueden expirar antes de que el usuario los use, mostrando el error `token_expired_retry`. Por defecto, Supabase configura la expiración en 1 hora (3600 segundos).

## Solución Local (Desarrollo)

Ya está configurado en `supabase/config.toml`:

```toml
[auth.email]
# Número de segundos antes de que el OTP expire (por defecto 1 hora).
# Aumentado a 24 horas (86400 segundos) para dar más tiempo a los usuarios
otp_expiry = 86400
```

Después de cambiar esta configuración, reinicia tu instancia local de Supabase:

```bash
supabase stop
supabase start
```

## Solución en Producción (Supabase Cloud)

Para configurar el tiempo de expiración en tu proyecto de Supabase Cloud:

### Opción 1: Dashboard de Supabase (Recomendado)

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com/)
2. Navega a **Authentication** → **Settings** → **Email Auth**
3. Busca la opción **"OTP Expiry"** o **"Email OTP expiry"**
4. Cambia el valor de `3600` (1 hora) a `86400` (24 horas)
5. Guarda los cambios

### Opción 2: SQL Editor

Si la opción no está disponible en el dashboard, puedes usar el SQL Editor:

```sql
-- Actualizar la configuración de expiración del OTP a 24 horas (86400 segundos)
UPDATE auth.config
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{otp_expiry}',
  '86400'
)
WHERE id = (SELECT id FROM auth.config LIMIT 1);
```

**Nota:** Este enfoque puede variar dependiendo de la versión de Supabase. Si no funciona, usa el Dashboard.

### Opción 3: Configuración via API (Avanzado)

Puedes usar la API de gestión de Supabase para actualizar la configuración, pero esto requiere permisos de administrador.

## Valores Recomendados

- **Desarrollo Local**: 86400 segundos (24 horas) - Permite probar sin presión
- **Producción**: 
  - **86400 segundos (24 horas)** - Para aplicaciones donde los usuarios pueden tardar en revisar su correo
  - **3600 segundos (1 hora)** - Para aplicaciones que requieren mayor seguridad
  - **7200 segundos (2 horas)** - Balance entre seguridad y usabilidad

## Verificación

Después de cambiar la configuración:

1. Envía un magic link a tu correo
2. Espera más de 1 hora (pero menos del nuevo tiempo configurado)
3. Intenta usar el link
4. Debería funcionar correctamente

## Notas Importantes

- El tiempo máximo recomendado es 7 días (604800 segundos) por razones de seguridad
- Cambios en producción pueden tardar unos minutos en aplicarse
- Si usas Supabase local, necesitas reiniciar el servicio para que los cambios surtan efecto

