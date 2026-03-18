# Research Competitors – Export para otro proyecto

Copia de la funcionalidad **Research Competitors** para usar en otro proyecto. **No se ha quitado nada** del proyecto original; esta carpeta es solo para copiar.

## Qué hace

- El usuario introduce un **nombre de usuario de Instagram**.
- La app llama a la API de RapidAPI (Instagram Looter) para obtener el ID del usuario y luego los **perfiles relacionados** (competidores / cuentas similares).
- Se muestran en una cuadrícula con enlace al perfil de Instagram, foto, nombre y @username.

## Cómo usarlo en otro proyecto

### 1. Variables de entorno

Necesitas una API key de **RapidAPI** para el producto **Instagram Looter 2**:

- Crea cuenta en [RapidAPI](https://rapidapi.com/) si no tienes.
- Suscríbete a [Instagram Looter2](https://rapidapi.com/instagram-looter2-api-instagram-looter2-api-default/api/instagram-looter2) (o similar; el host usado es `instagram-looter2.p.rapidapi.com`).
- En tu proyecto (`.env.local` o variables de Vercel):

```env
RAPIDAPI_KEY=tu_api_key_de_rapidapi
```

### 2. Archivos a copiar

- **API:**  
  Copia la carpeta `api/research-competitors/` a la ruta de rutas API de tu proyecto, por ejemplo:
  - Next.js App Router: `app/api/research-competitors/route.ts`
- **Página:**  
  Copia `page.tsx` a tu ruta de la herramienta, por ejemplo:
  - Next.js: `app/tools/research-competitors/page.tsx` (o la ruta que uses para “tools”).

### 3. Layout

La página exportada usa un layout mínimo (solo un `div` con estilos). Si en tu proyecto usas un layout con sidebar/nav (como `DashboardLayout`), envuelve el contenido así:

```tsx
import YourLayout from '@/components/YourLayout';

export default function ResearchCompetitors() {
  // ... estado y handleResearch igual que en page.tsx ...
  return (
    <YourLayout>
      <div className="mx-auto max-w-7xl px-4 py-8 ...">
        {/* resto del JSX de la página */}
      </div>
    </YourLayout>
  );
}
```

### 4. Rutas en tu app

Añade en tu menú o router un enlace a la ruta donde hayas puesto la página, por ejemplo `/tools/research-competitors`.

## Estructura de la exportación

```
research-competitors-export/
├── README.md                 (este archivo)
├── api/
│   └── research-competitors/
│       └── route.ts          (POST: body { username }, devuelve { success, competitors, userId })
└── page.tsx                  (página con input + grid de resultados; layout mínimo)
```

## Respuesta de la API

- **POST** `/api/research-competitors`
- **Body:** `{ "username": "nombre_sin_@" }`
- **200:** `{ "success": true, "competitors": [ { "username", "full_name", "profile_pic_url", "id" }, ... ], "userId": "..." }`
- **4xx/5xx:** `{ "error": "mensaje" }`

## Dependencias

- Next.js (App Router) con `fetch` en cliente.
- Solo depende de la API de RapidAPI; no usa base de datos ni otros servicios del proyecto original.
