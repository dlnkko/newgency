# 🔍 Cómo Obtener las Credenciales Correctas de Whop

## ❌ PROBLEMA ACTUAL

Tienes en `.env.local`:
```
NEXT_PUBLIC_WHOP_APP_ID=prod_ZfB8PwCxIaiC2  ❌ ESTO ES INCORRECTO
```

`prod_ZfB8PwCxIaiC2` es un **Product ID**, NO un **App ID**.

## ✅ SOLUCIÓN

### Paso 1: Obtener el App ID (Client ID) correcto

1. Ve a https://dev.whop.com/
2. Selecciona tu App "Newgency AI"
3. Ve a la pestaña **"OAuth"** (o "Detalles de la aplicación")
4. Busca el **"Client ID"** o **"App ID"**
   - Debe empezar con `app_` (ejemplo: `app_1NcIzCMmQK7kYR`)
   - NO debe empezar con `prod_`

### Paso 2: Obtener el Client Secret

En la misma página de OAuth:
- Busca el **"Client Secret"**
- Es un string largo (no empieza con `app_` ni `prod_`)

### Paso 3: Obtener el Product ID de tu comunidad

1. Ve a tu dashboard de Whop → **Productos**
2. Encuentra "The AI Ad Revolution"
3. El Product ID debe empezar con `prod_`
   - Si es `prod_ZfB8PwCxIaiC2`, ese está bien para el Product ID

### Paso 4: Obtener la API Key

1. Ve a https://dev.whop.com/
2. Ve a tu App → pestaña **"Configuraciones"** o busca **"API Keys"**
3. Copia tu **API Key** (empieza con `apik_`)

## 📝 Variables Correctas

Tu `.env.local` debería verse así:

```env
# App ID (Client ID) - DEBE empezar con "app_"
NEXT_PUBLIC_WHOP_APP_ID=app_1NcIzCMmQK7kYR

# Client Secret - string largo sin prefijo especial
WHOP_CLIENT_SECRET=tu_client_secret_aqui

# Product ID de tu comunidad - DEBE empezar con "prod_"
NEXT_PUBLIC_WHOP_PRODUCT_ID=prod_ZfB8PwCxIaiC2

# API Key - DEBE empezar con "apik_"
WHOP_API_KEY=apik_tu_api_key_aqui
```

## 🔑 Diferencia Clave

| Variable | Prefijo | Dónde encontrarlo |
|----------|---------|-------------------|
| `NEXT_PUBLIC_WHOP_APP_ID` | `app_` | Developer Dashboard → Tu App → OAuth |
| `WHOP_CLIENT_SECRET` | (ninguno) | Developer Dashboard → Tu App → OAuth |
| `NEXT_PUBLIC_WHOP_PRODUCT_ID` | `prod_` | Dashboard → Productos → Tu Comunidad |
| `WHOP_API_KEY` | `apik_` | Developer Dashboard → API Keys |

## ⚠️ IMPORTANTE

- **NO confundas** el Product ID (`prod_`) con el App ID (`app_`)
- El App ID es para OAuth (login)
- El Product ID es para verificar acceso a tu comunidad

