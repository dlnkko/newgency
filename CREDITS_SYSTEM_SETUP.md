# Sistema de Créditos - Guía de Configuración

## 📋 Resumen

Sistema de créditos implementado donde:
- **500 créditos = $39**
- **Costo operativo por generación: $0.005**
- **Seguridad crítica**: Los créditos solo se consumen del lado del servidor usando funciones RPC atómicas

## 🔧 Configuración Requerida

### 1. Variables de Entorno

Agrega estas variables en tu `.env.local` y en Vercel:

```env
# Whop Configuration
WHOP_PRODUCT_ID=tu_product_id_de_whop_aqui
WHOP_WEBHOOK_SECRET=tu_webhook_secret_de_whop
NEXT_PUBLIC_WHOP_PURCHASE_URL=https://whop.com/checkout/tu-producto

# Supabase (ya deberías tenerlas)
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### 2. Migración de Base de Datos

Ejecuta la migración SQL en tu base de datos de Supabase:

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **SQL Editor**
3. Ejecuta el contenido de `supabase/migrations/001_add_credits_system.sql`

O ejecuta directamente:

```sql
-- Ver el archivo supabase/migrations/001_add_credits_system.sql
```

La migración:
- ✅ Agrega columna `credits` a la tabla `profiles`
- ✅ Crea función RPC `consume_credit()` para consumo atómico
- ✅ Crea función RPC `add_credits()` para agregar créditos
- ✅ Configura Row Level Security (RLS) para proteger los créditos

### 3. Configurar Webhook de Whop

1. Ve a tu dashboard de Whop
2. Navega a **Settings** → **Webhooks**
3. Agrega un nuevo webhook:
   - **URL**: `https://tu-dominio.com/api/webhooks/whop`
   - **Eventos**: Selecciona `payment.succeeded` y `checkout.completed`
   - **Secret**: Genera un secret y guárdalo en `WHOP_WEBHOOK_SECRET`

### 4. Crear Producto en Whop

1. Crea un producto en Whop por **$39** (500 créditos)
2. Copia el **Product ID** y guárdalo en `WHOP_PRODUCT_ID`
3. Copia la **URL de checkout** y guárdala en `NEXT_PUBLIC_WHOP_PURCHASE_URL`

## 🔒 Seguridad

### Row Level Security (RLS)

El sistema está protegido con RLS:
- ✅ Los usuarios solo pueden **ver** su propio perfil
- ✅ Los usuarios **NO pueden modificar** sus créditos directamente
- ✅ Los créditos solo se modifican mediante funciones RPC con `SECURITY DEFINER`

### Consumo Atómico

La función `consume_credit()` usa:
- ✅ `FOR UPDATE` para lockear la fila
- ✅ Verificación de balance antes de consumir
- ✅ Actualización atómica (todo o nada)

Esto previene:
- ❌ Race conditions
- ❌ Consumo doble de créditos
- ❌ Balance negativo

## 📊 Flujo del Sistema

### 1. Compra de Créditos
```
Usuario → Whop Checkout → Pago Exitoso → Webhook → add_credits() → +500 créditos
```

### 2. Generación de Contenido
```
Usuario → API Endpoint → verifyAndConsumeCredit() → consume_credit() RPC
  → Si éxito: Procede con generación
  → Si falla: Retorna 402 Payment Required
```

### 3. Frontend
```
Componente CreditsCounter → /api/user/credits → Muestra balance
  → Si créditos = 0: Muestra botón "Comprar 500 créditos ($39)"
  → Si créditos < 10: Muestra botón "Comprar más"
```

## 🧪 Testing

### Test Manual del Webhook

Puedes probar el webhook localmente usando ngrok:

```bash
# Terminal 1: Inicia tu servidor Next.js
npm run dev

# Terminal 2: Expone tu servidor local
ngrok http 3000

# Usa la URL de ngrok en la configuración del webhook de Whop
```

### Test de Consumo de Créditos

1. Asegúrate de tener créditos en tu perfil
2. Intenta generar contenido
3. Verifica que los créditos se reducen en 1
4. Intenta generar sin créditos → Debe retornar 402

## 📝 Notas Importantes

1. **Tabla `profiles`**: El sistema asume que existe una tabla `profiles` con:
   - `id` (UUID, primary key)
   - `email` (text)
   - `credits` (integer, default 0)

2. **Autenticación**: El sistema usa `getAuthenticatedUser()` que lee de las cookies de sesión.

3. **Creación Automática**: Si un usuario no tiene perfil, se crea automáticamente con 0 créditos.

4. **Sincronización**: El componente `CreditsCounter` recarga el balance cada 30 segundos automáticamente.

## 🚨 Troubleshooting

### Error: "User not found" en webhook
- Verifica que el email en Whop coincida con el email en `profiles`
- Verifica que existe la columna `whop_user_id` si quieres usar ID de Whop

### Error: "RPC function not found"
- Verifica que ejecutaste la migración SQL
- Verifica que las funciones `consume_credit` y `add_credits` existen en Supabase

### Error: "RLS policy violation"
- Verifica que las funciones RPC tienen `SECURITY DEFINER`
- Verifica que estás usando `SUPABASE_SERVICE_ROLE_KEY` en el webhook

### Créditos no se actualizan en tiempo real
- El componente recarga cada 30 segundos
- Puedes forzar recarga llamando a `loadCredits()` manualmente








