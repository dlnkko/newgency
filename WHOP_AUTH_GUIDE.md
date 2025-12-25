# Guía de Autenticación con Whop

## 📋 Conceptos Importantes

### Diferencia entre "App" y "Producto/Comunidad"

1. **App de Whop** (en Developer Dashboard):
   - Es solo para obtener credenciales OAuth (Client ID, Client Secret)
   - **NO necesita publicarse** para que funcione el login
   - Solo necesitas crearla y configurar el Redirect URI
   - Se usa para autenticar usuarios

2. **Tu Producto/Comunidad** (ej: "The AI Ad Revolution"):
   - Es tu producto real que quieres proteger
   - Tiene un Product ID (ej: `prod_xxxxx`)
   - Se usa para verificar si el usuario tiene acceso pagado

## 🔑 Variables de Entorno Necesarias

```env
# De la App en Whop Developer Dashboard (NO necesita publicarse)
NEXT_PUBLIC_WHOP_APP_ID=app_xxxxx          # Client ID de tu App
WHOP_CLIENT_SECRET=xxxxx                    # Client Secret de tu App

# De tu Producto/Comunidad (ej: "The AI Ad Revolution")
NEXT_PUBLIC_WHOP_PRODUCT_ID=prod_xxxxx     # Product ID de tu comunidad

# API Key para verificar acceso (de Developer Dashboard)
WHOP_API_KEY=apik_xxxxx                    # API Key de tu cuenta
```

## 📝 Pasos para Configurar

### 1. Crear App en Whop (solo para credenciales)

1. Ve a https://dev.whop.com/
2. Crea una nueva App (o usa la existente "Newgency AI")
3. **NO necesitas publicarla** - solo necesitas las credenciales
4. Ve a la pestaña **"OAuth"**
5. Agrega el Redirect URI:
   ```
   https://newgency.vercel.app/api/auth/callback
   ```
6. Copia el **Client ID** (App ID) y **Client Secret**

### 2. Obtener Product ID de tu Comunidad

1. Ve a tu dashboard de Whop → **Productos**
2. Encuentra tu producto "The AI Ad Revolution"
3. Copia el **Product ID** (formato: `prod_xxxxx`)
   - Puedes verlo en la URL o en los detalles del producto

### 3. Obtener API Key

1. Ve a https://dev.whop.com/
2. Ve a tu App → pestaña **"Configuraciones"** o **"API Keys"**
3. Copia tu **API Key** (formato: `apik_xxxxx`)

### 4. Configurar en Vercel

1. Ve a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Agrega todas las variables:
   - `NEXT_PUBLIC_WHOP_APP_ID` = Client ID de tu App
   - `WHOP_CLIENT_SECRET` = Client Secret de tu App
   - `NEXT_PUBLIC_WHOP_PRODUCT_ID` = Product ID de tu comunidad
   - `WHOP_API_KEY` = API Key
4. Haz redeploy

## ✅ Cómo Funciona

1. Usuario hace clic en "Entrar con Whop"
2. Se redirige a Whop OAuth (usa credenciales de tu App)
3. Usuario autoriza
4. Whop redirige de vuelta con un código
5. Tu app intercambia el código por un token
6. Verificas acceso al Product ID de tu comunidad
7. Si tiene acceso → permite entrar
8. Si no tiene acceso → muestra mensaje de error

## 🔍 Verificar que Todo Esté Correcto

### En Whop Developer Dashboard:
- ✅ App creada (no necesita publicarse)
- ✅ Redirect URI configurado: `https://newgency.vercel.app/api/auth/callback`
- ✅ Client ID y Client Secret copiados

### En Whop Products Dashboard:
- ✅ Producto "The AI Ad Revolution" existe
- ✅ Product ID copiado (formato `prod_xxxxx`)
- ✅ Producto está publicado en Discover (opcional, pero recomendado)

### En Vercel:
- ✅ Todas las variables de entorno configuradas
- ✅ Redeploy hecho después de agregar variables

## 🐛 Troubleshooting

### Error 401 "invalid_client"
- Verifica que `WHOP_CLIENT_SECRET` sea correcto
- Verifica que `NEXT_PUBLIC_WHOP_APP_ID` sea correcto
- Asegúrate de que no haya espacios extra en las variables

### Error "redirect_uri mismatch"
- El Redirect URI en Whop debe ser EXACTAMENTE: `https://newgency.vercel.app/api/auth/callback`
- Sin barra final
- Con `https://`
- Sin espacios

### Error "no_access"
- Verifica que `NEXT_PUBLIC_WHOP_PRODUCT_ID` sea el correcto
- Verifica que el usuario tenga una membresía activa del producto
- Verifica que `WHOP_API_KEY` sea correcta

## 📚 Referencias

- [Documentación de Autenticación de Whop](https://docs.whop.com/developer/guides/authentication)
- [API Reference - Check Access](https://docs.whop.com/api-reference/users/check-access)

