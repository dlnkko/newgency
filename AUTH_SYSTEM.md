# Sistema de Autenticación Simplificado

Este documento explica el sistema de autenticación simplificado basado en verificación de email en la tabla `whop_users`.

## Características

### Autenticación Simple
- El usuario ingresa su email en `/login`
- Se verifica que el email exista en la tabla `whop_users` con `status = 'active'`
- Si es válido, se crea una sesión simple basada en cookies
- No se usa Supabase Auth, solo verificación directa en la base de datos

### Persistencia de Sesión
- La sesión se guarda en una cookie `app_session` (válida por 30 días)
- El middleware verifica la sesión en cada petición
- El middleware también verifica en tiempo real el status en `whop_users`

### Expulsión Automática
- Si el webhook de Whop actualiza el status a `inactive`, el usuario es expulsado automáticamente en la siguiente petición
- La verificación consulta directamente la base de datos, garantizando datos actualizados

## Flujo de Autenticación

```
1. Usuario ingresa email en /login
   ↓
2. Frontend llama a /api/auth/login con el email
   ↓
3. Backend verifica que el email esté en whop_users con status='active'
   ↓
4. Si es válido, se crea cookie 'app_session' con el email
   ↓
5. Usuario es redirigido a /dashboard
   ↓
6. Middleware verifica cookie de sesión y status en whop_users
   ↓
7. Si status === 'active', permite acceso
   ↓
8. Si status !== 'active', elimina cookie y redirige a /login
```

## Rutas API

### POST `/api/auth/login`
- Recibe: `{ email: string }`
- Verifica que el email esté en `whop_users` con `status = 'active'`
- Si es válido, crea cookie `app_session` y retorna éxito
- Si no es válido, retorna error 403

### GET `/api/auth/logout`
- Elimina la cookie `app_session`
- Redirige a `/login`

## Middleware

El middleware se ejecuta en cada petición a rutas protegidas (`/dashboard`, `/tools`):

1. **Obtiene la cookie `app_session`**
2. **Si no hay cookie**, redirige a `/login`
3. **Si hay cookie**, parsea el email
4. **Consulta `whop_users`** para verificar el status
5. **Si `status !== 'active'`**:
   - Elimina la cookie
   - Redirige a `/login?error=no_active_membership`
6. **Si `status === 'active'`**, permite el acceso

## Ventajas del Sistema

1. **Simplicidad**: No requiere Supabase Auth, solo consulta directa a la base de datos
2. **Persistencia**: La sesión se mantiene entre recargas del navegador
3. **Seguridad**: Verificación en tiempo real del estado de la membresía
4. **Expulsión Automática**: Los usuarios inactivos son expulsados automáticamente

## Configuración

### Variables de Entorno Requeridas
```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### Estructura de la Cookie de Sesión
```json
{
  "email": "usuario@ejemplo.com",
  "verified": true,
  "timestamp": 1234567890
}
```

## Notas

- La cookie `app_session` tiene una duración de 30 días
- La verificación en tiempo real garantiza que los cambios en `whop_users` se reflejen inmediatamente
- No se requiere configuración adicional de Supabase Auth

