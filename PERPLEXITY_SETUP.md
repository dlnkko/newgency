# Configuración de Perplexity API Key

## Problema: "PERPLEXITY_API_KEY is not set"

Si ves este error aunque hayas agregado la variable en `.env.local`, sigue estos pasos:

### 1. Verificar que la variable está en `.env.local`

Abre el archivo `.env.local` en la raíz del proyecto y verifica que tenga:

```env
PERPLEXITY_API_KEY=pplx-tu-api-key-aqui
```

**IMPORTANTE:**
- No debe tener espacios alrededor del `=`
- No debe tener comillas a menos que la API key las incluya
- El archivo debe estar en la raíz del proyecto (mismo nivel que `package.json`)

### 2. Reiniciar el servidor de Next.js

**Next.js NO recarga variables de entorno automáticamente**. Debes:

1. Detener el servidor (Ctrl+C en la terminal)
2. Reiniciar con `npm run dev`

### 3. Verificar en la consola

Cuando reinicies, deberías ver en la consola del servidor:

```
=== VERIFICACIÓN PERPLEXITY API KEY ===
PERPLEXITY_API_KEY existe? true
PERPLEXITY_API_KEY primeros 10 chars: pplx-xxxxx...
PERPLEXITY_API_KEY longitud: 54
```

Si ves `existe? false`, la variable no se está leyendo correctamente.

### 4. Soluciones comunes

#### Problema: La variable no se lee

**Solución A:** Verifica que el archivo se llame exactamente `.env.local` (no `.env`, no `.env.local.txt`)

**Solución B:** Elimina espacios en blanco al inicio o final:
```env
# ❌ MAL
PERPLEXITY_API_KEY = pplx-...
PERPLEXITY_API_KEY=pplx-... 

# ✅ BIEN
PERPLEXITY_API_KEY=pplx-tu-api-key-aqui
```

**Solución C:** Si usas VSCode, guarda el archivo (Ctrl+S) después de editarlo

#### Problema: El servidor ya está corriendo

**Solución:** Siempre reinicia el servidor después de modificar `.env.local`

```bash
# Detener servidor (Ctrl+C)
# Luego reiniciar:
npm run dev
```

#### Problema: Estás en producción (Vercel)

**Solución:** En Vercel, las variables se configuran en:
1. Dashboard de Vercel → Tu Proyecto → Settings → Environment Variables
2. Agrega `PERPLEXITY_API_KEY` con tu valor
3. Haz un redeploy

### 5. Probar la configuración

Después de reiniciar, prueba el reverse engineer:
- Ve a la herramienta Reverse Engineer
- Ingresa una URL de ad o video
- En la consola del servidor deberías ver los logs de verificación

### 6. Si nada funciona

Ejecuta este comando para verificar que Next.js puede leer la variable:

```bash
node -e "require('dotenv').config({path: '.env.local'}); console.log('API Key:', process.env.PERPLEXITY_API_KEY ? 'OK' : 'NO ENCONTRADA')"
```

Si aún no funciona, verifica:
- Que no hay caracteres especiales ocultos en el archivo
- Que el archivo está guardado en UTF-8
- Que estás en el directorio correcto
