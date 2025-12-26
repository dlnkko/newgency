# Guía de Configuración OAuth de Whop

## ⚠️ IMPORTANTE: Diferencia entre API Key y Client Secret

**NO son lo mismo:**
- **API Key** (`apik_...`): Se usa para llamadas a la API de Whop desde el servidor
- **Client Secret**: Se usa SOLO para OAuth2, se obtiene en la sección OAuth de tu App

## Pasos para Obtener las Credenciales Correctas

### 1. Ve a Whop Developer Portal
https://dev.whop.com/

### 2. Selecciona tu App
- Si no tienes una App, créala primero
- El App ID debe empezar con `app_` (NO `prod_`)

### 3. Ve a la Sección OAuth
1. En tu App, busca la pestaña/sección **"OAuth"**
2. Ahí encontrarás:
   - **Client ID**: Debe empezar con `app_` (ej: `app_1NcIzCMmQK7kYR`)
   - **Client Secret**: Es un string largo, NO empieza con `apik_`

### 4. Configura el Redirect URI
En la misma sección OAuth, agrega:
```
https://newgency.vercel.app/api/auth/callback
```
- **EXACTAMENTE** así, sin barra final
- Con `https://` (no `http://`)
- Sin espacios

### 5. Copia las Credenciales
- **Client ID**: Copia el valor completo (empieza con `app_`)
- **Client Secret**: Copia el valor completo (NO es el API Key)

### 6. Configura en Vercel
Ve a Vercel → Tu Proyecto → Settings → Environment Variables y agrega:

```env
WHOP_CLIENT_ID=app_xxxxx  # El Client ID de la sección OAuth
WHOP_CLIENT_SECRET=xxxxx  # El Client Secret de la sección OAuth (NO el API Key)
WHOP_API_KEY=apik_xxxxx   # Este SÍ es el API Key (para el SDK)
NEXT_PUBLIC_WHOP_PRODUCT_ID=prod_ZfB8PwCxIaiC2
```

## Verificación

1. **Client ID** debe empezar con `app_`
2. **Client Secret** NO debe empezar con `apik_`
3. **API Key** SÍ debe empezar con `apik_` (pero es diferente del Client Secret)
4. **Redirect URI** debe coincidir exactamente

## Si No Tienes Client Secret

Si en la sección OAuth de tu App no aparece un Client Secret:
1. Puede que necesites generar uno nuevo
2. Busca un botón como "Generate Client Secret" o "Reset Secret"
3. Si no aparece, puede que necesites habilitar OAuth en tu App primero

## Troubleshooting

### Error: "invalid_client"
- Verifica que el Client Secret NO sea el API Key
- Verifica que el Client ID empiece con `app_`
- Verifica que no haya espacios en las credenciales
- Verifica que el Redirect URI coincida exactamente

### Error: "redirect_uri_mismatch"
- El Redirect URI en Whop debe ser EXACTAMENTE: `https://newgency.vercel.app/api/auth/callback`
- Sin barra final, sin espacios, con https://

