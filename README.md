This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment Variables Setup

#### Local Development

1. Create a `.env.local` file in the root directory:
   ```bash
   touch .env.local
   ```

2. Add your API keys to `.env.local`:
   ```env
   # Google Gemini API Key
   # Get your API key from: https://aistudio.google.com/apikey
   GOOGLE_GENAI_API_KEY=your_google_genai_api_key_here

   # Firecrawl API Key
   # Get your API key from: https://firecrawl.dev
   # Note: The API key should start with 'fc-' prefix
   FIRECRAWL_API_KEY=fc-your_firecrawl_api_key_here

   # ScrapeCreators API Key
   # Get your API key from: https://scrapecreators.com
   # Used for extracting transcripts from Instagram Reels and TikTok videos
   SCRAPECREATORS_API_KEY=your_scrapecreators_api_key_here

   # Perplexity API Key (Para usar Sonar Pro)
   # Get your API key from: https://www.perplexity.ai/settings/api
   # Usado para investigación avanzada y generación de contenido con Sonar Pro
   PERPLEXITY_API_KEY=your_perplexity_api_key_here

   # Upstash Redis (OPCIONAL - Recomendado solo para producción seria)
   # Si NO lo configuras: el rate limiting funciona pero se resetea en cada deploy
   # Si SÍ lo configuras: rate limiting persistente que sobrevive a reinicios
   # Obtén tus credenciales gratis en: https://console.upstash.com/
   # UPSTASH_REDIS_REST_URL=your_upstash_redis_url_here
   # UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token_here
   ```

3. Replace the placeholder values with your actual API keys.

**Important:** The `.env.local` file is already in `.gitignore` and will not be committed to version control.

#### Vercel Deployment

When deploying to Vercel, you need to add the environment variables in the Vercel dashboard:

1. Go to your project settings in Vercel
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `GOOGLE_GENAI_API_KEY` = your Google Gemini API key
   - `FIRECRAWL_API_KEY` = your Firecrawl API key (with `fc-` prefix)
   - `SCRAPECREATORS_API_KEY` = your ScrapeCreators API key (for Instagram Reel and TikTok transcript extraction)
   - `PERPLEXITY_API_KEY` = your Perplexity API key (OPCIONAL - para usar Sonar Pro en investigación y generación)
   - `UPSTASH_REDIS_REST_URL` = your Upstash Redis URL (OPCIONAL - solo si quieres rate limiting persistente)
   - `UPSTASH_REDIS_REST_TOKEN` = your Upstash Redis token (OPCIONAL - solo si quieres rate limiting persistente)
   
   **Nota sobre Rate Limiting:**
   - Sin Upstash: El rate limiting funciona pero se resetea en cada deploy
   - Con Upstash: El rate limiting persiste entre redeploys (recomendado para producción)
   - Puedes lanzar a producción sin configurarlo, funcionará igual

4. After adding the variables, redeploy your application.

**Note:** No quotes are needed when adding environment variables in Vercel. Just paste the API key value directly.

### Rate Limiting

The application includes rate limiting to protect against abuse and control API costs. Rate limits are applied per IP address:

- **Analyze API** (`/api/analyze`): 10 requests per hour
- **Generate Static Ad Prompt** (`/api/generate-static-ad-prompt`): 15 requests per hour
- **Generate Product Video** (`/api/generate-product-video`): 20 requests per hour
- **Enhance Prompt** (`/api/enhance-prompt`): 30 requests per hour
- **Scrape URL** (`/api/scrape-url`): 50 requests per hour

#### ¿Necesitas configurar variables de entorno para Rate Limiting?

**NO es obligatorio**, pero **SÍ es recomendable para producción**:

**Opción 1: Sin variables de entorno (Funciona pero limitado)**
- El rate limiting funciona con almacenamiento en memoria
- ⚠️ Se resetea cada vez que Vercel hace un redeploy o el servidor se reinicia
- ✅ Funciona para empezar
- ⚠️ Los límites no persisten entre reinicios

**Opción 2: Con Upstash Redis (Recomendado para producción)**
- Rate limiting persistente que sobrevive a reinicios
- ✅ Límites funcionan correctamente entre redeploys
- ✅ Mejor control y seguridad
- 📝 Configuración:
  1. Crea una cuenta gratis en [Upstash Redis](https://console.upstash.com/)
  2. Crea una base de datos Redis
  3. Copia la URL y Token
  4. Agrega en Vercel:
     - `UPSTASH_REDIS_REST_URL` = tu URL de Upstash
     - `UPSTASH_REDIS_REST_TOKEN` = tu token de Upstash

**Conclusión:** Puedes lanzar a producción sin configurar Upstash. El rate limiting funcionará, pero se reseteará en cada deploy. Para producción seria, configúralo.

When a rate limit is exceeded, the API returns a `429` status code with details about when to retry.

## Perplexity Sonar Pro Integration

Esta aplicación incluye integración con **Perplexity Sonar Pro**, un modelo avanzado de IA diseñado para investigación profunda y análisis complejos.

### Características de Sonar Pro

- **Modelo avanzado**: Optimizado para tareas de preguntas y respuestas complejas de múltiples pasos
- **Contexto extenso**: Hasta 200,000 tokens de contexto
- **Búsqueda mejorada**: El doble de resultados de búsqueda comparado con el modelo estándar
- **Citas incluidas**: Genera respuestas con citas a fuentes para verificación

### Endpoints disponibles con Perplexity

#### 1. `/api/research-perplexity`
Endpoint de investigación con Perplexity Sonar Pro que incluye citas a fuentes.

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/research-perplexity', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Analiza las tendencias de marketing en redes sociales para 2024',
    includeCitations: true, // Opcional, por defecto true
    model: 'sonar-pro' // Opcional, por defecto 'sonar-pro'
  })
});

const data = await response.json();
console.log(data.content); // Respuesta detallada
console.log(data.citations); // Array de URLs citadas
```

#### 2. `/api/generate-viral-script-perplexity`
Versión alternativa del generador de scripts virales que usa Perplexity Sonar Pro en lugar de Gemini.

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/generate-viral-script-perplexity', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoUrl: 'https://www.instagram.com/reel/...',
    productDescription: 'Descripción de tu producto'
  })
});

const data = await response.json();
console.log(data.script); // Script generado con Sonar Pro
```

### Uso en tu código

También puedes usar las funciones helper directamente:

```typescript
import { generateTextWithSonarPro, generateWithCitations } from '@/lib/perplexity';

// Generar texto simple
const text = await generateTextWithSonarPro(
  'Explica las ventajas del marketing en TikTok',
  'Eres un experto en marketing digital',
  { temperature: 0.7, max_tokens: 2048 }
);

// Generar con citas (para investigación)
const research = await generateWithCitations(
  '¿Cuáles son las últimas tendencias en IA?'
);
console.log(research.content);
console.log(research.citations);
```

### Modelos disponibles

- `sonar-pro`: Modelo avanzado para tareas complejas (recomendado)
- `sonar`: Modelo estándar
- `sonar-pro-online`: Con búsqueda en tiempo real
- `sonar-online`: Con búsqueda en tiempo real (estándar)

### Precios aproximados

- **Input**: $3 por millón de tokens
- **Output**: $15 por millón de tokens

### Configuración

1. Obtén tu API key en [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Agrega `PERPLEXITY_API_KEY` a tu `.env.local` o en Vercel
3. ¡Listo! Ya puedes usar los endpoints o funciones helper

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
