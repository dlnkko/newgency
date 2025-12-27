import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';

// Helper function to get and validate API key at runtime
function getGoogleGenAI() {
  const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;
  
  if (!googleApiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return new GoogleGenAI({ 
    apiKey: googleApiKey 
  });
}

function getScrapeCreatorsApiKey() {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  
  if (!apiKey) {
    throw new Error('SCRAPECREATORS_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return apiKey;
}

// Helper function to detect language from text (simple heuristic)
function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'en';
  
  // Simple heuristic based on common characters
  const spanishChars = /[ñáéíóúüÑÁÉÍÓÚÜ]/;
  const hasSpanishChars = spanishChars.test(text);
  
  // Count common Spanish words vs English words
  const spanishWords = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'del', 'una'];
  const englishWords = ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at'];
  
  const lowerText = text.toLowerCase();
  const spanishCount = spanishWords.filter(word => lowerText.includes(word)).length;
  const englishCount = englishWords.filter(word => lowerText.includes(word)).length;
  
  if (hasSpanishChars || spanishCount > englishCount) {
    return 'es';
  }
  
  return 'en';
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('analyze', request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          details: rateLimitResult.error,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          reset: rateLimitResult.reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit?.toString() || '',
            'X-RateLimit-Remaining': rateLimitResult.remaining?.toString() || '0',
            'X-RateLimit-Reset': rateLimitResult.reset?.toString() || '',
            'Retry-After': rateLimitResult.reset?.toString() || '3600',
          },
        }
      );
    }

    // Initialize AI client at runtime
    const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;
    console.log('=== VERIFICACIÓN DE API KEYS ===');
    console.log('GOOGLE_GENAI_API_KEY existe?', !!googleApiKey);
    console.log('GOOGLE_GENAI_API_KEY primeros 10 chars:', googleApiKey ? `${googleApiKey.substring(0, 10)}...` : 'NO DEFINIDA');
    console.log('GOOGLE_GENAI_API_KEY longitud:', googleApiKey?.length || 0);
    
    const ai = getGoogleGenAI();
    const body = await request.json();
    const { url, type, productService, productImage } = body;

    if (!url || !type) {
      return NextResponse.json(
        { error: 'URL and analysis type are required' },
        { status: 400 }
      );
    }

    // Extraer el ID de la URL de Facebook Ads Library
    // Formato esperado: https://www.facebook.com/ads/library/?id=869163755461256
    let adId: string | null = null;
    try {
      const urlObj = new URL(url);
      adId = urlObj.searchParams.get('id');
    } catch (urlError) {
      // Si falla el parsing, intentar extraer el ID con regex
      const idMatch = url.match(/[?&]id=(\d+)/);
      if (idMatch) {
        adId = idMatch[1];
      }
    }

    if (!adId) {
      return NextResponse.json(
        { error: 'Could not extract ad ID from URL. Make sure the URL has the correct format: https://www.facebook.com/ads/library/?id=XXXXX' },
        { status: 400 }
      );
    }

    // Llamar a la API de scrapecreators con el ID y get_transcript: true
    let data;
    try {
      const scrapeCreatorsApiKey = getScrapeCreatorsApiKey();
      const response = await axios.get(
        `https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${adId}`,
        {
          headers: {
            'x-api-key': scrapeCreatorsApiKey,
            'get_transcript': 'true'
          },
          timeout: 30000, // 30 segundos de timeout
          validateStatus: (status) => status < 500 // No lanzar error para códigos 4xx
        }
      );
      
      // Log de la respuesta completa para debugging
      console.log('=== RESPUESTA COMPLETA DE SCRAPECREATORS ===');
      console.log('response.status:', response.status);
      console.log('API Key usada (primeros 10 chars):', scrapeCreatorsApiKey ? `${scrapeCreatorsApiKey.substring(0, 10)}...` : 'NO DEFINIDA');
      console.log('response.data type:', typeof response.data);
      console.log('response.data keys:', Object.keys(response.data || {}));
      console.log('response.data completo (primeros 500 chars):', JSON.stringify(response.data, null, 2).substring(0, 500));
      
      // Verificar errores de créditos o pagos (402)
      if (response.status === 402) {
        const errorMessage = response.data?.message || 'No credits available';
        console.error('❌ Error 402 - Sin créditos:', errorMessage);
        return NextResponse.json(
          {
            error: 'No credits in ScrapeCreators',
            details: errorMessage || 'Your ScrapeCreators account does not have available credits. Please purchase more credits at https://scrapecreators.com',
            statusCode: 402
          },
          { status: 402 }
        );
      }
      
      // Verificar otros errores HTTP (4xx)
      if (response.status >= 400 && response.status < 500) {
        const errorMessage = response.data?.message || response.data?.error || 'Unknown error';
        console.error(`❌ Error ${response.status}:`, errorMessage);
        return NextResponse.json(
          {
            error: 'Error getting ad data',
            details: errorMessage,
            statusCode: response.status
          },
          { status: response.status }
        );
      }
      
      // La respuesta puede estar en response.data directamente o en response.data.message
      data = response.data;
      
      // Si los datos están dentro de 'message', extraerlos
      if (data && typeof data === 'object' && 'message' in data && !('snapshot' in data)) {
        console.log('⚠️ Los datos están dentro de "message", extrayendo...');
        const messageData = data.message;
        if (messageData && typeof messageData === 'object' && 'snapshot' in messageData) {
          console.log('✅ Datos encontrados en data.message');
          data = messageData;
        } else if (typeof messageData === 'string') {
          // Si message es un string JSON, parsearlo
          try {
            const parsed = JSON.parse(messageData);
            if (parsed && typeof parsed === 'object' && 'snapshot' in parsed) {
              console.log('✅ Datos parseados desde string JSON en message');
              data = parsed;
            }
          } catch (e) {
            console.log('❌ No se pudo parsear message como JSON');
          }
        }
      }
      
      console.log('Data final keys:', Object.keys(data || {}));
      console.log('Data tiene snapshot?', !!(data?.snapshot));
    } catch (scrapeError: any) {
      // Manejar errores específicos de la API de ScrapeCreators
      if (axios.isAxiosError(scrapeError)) {
        const errorCode = scrapeError.code;
        const errorMessage = scrapeError.message;
        
        // Error de DNS o conectividad
        if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
          console.error('Error de conexión con ScrapeCreators API:', {
            code: errorCode,
            message: errorMessage,
            url: scrapeError.config?.url
          });
          
          return NextResponse.json(
            {
              error: 'Connection error with ScrapeCreators API',
              details: `Could not connect to ScrapeCreators API. Check your internet connection or that the service is available. Error: ${errorMessage}`,
              errorCode: errorCode
            },
            { status: 503 }
          );
        }
        
        // Error de autenticación (401, 403)
        if (scrapeError.response?.status === 401 || scrapeError.response?.status === 403) {
          return NextResponse.json(
            {
              error: 'Authentication error with ScrapeCreators API',
              details: 'The ScrapeCreators API key is not valid or has expired. Verify your API key in the .env.local file'
            },
            { status: 401 }
          );
        }
        
        // Error de recurso no encontrado (404)
        if (scrapeError.response?.status === 404) {
          return NextResponse.json(
            {
              error: 'Ad not found',
              details: `Could not find the ad with ID ${adId} in the Facebook Ads library. Verify that the ID is correct.`
            },
            { status: 404 }
          );
        }
        
        // Otros errores HTTP
        if (scrapeError.response) {
          return NextResponse.json(
            {
              error: 'Error getting ad data',
              details: scrapeError.response.data || scrapeError.message,
              statusCode: scrapeError.response.status
            },
            { status: scrapeError.response.status }
          );
        }
      }
      
      // Error desconocido
      console.error('Error desconocido al llamar a ScrapeCreators:', scrapeError);
      return NextResponse.json(
        {
          error: 'Error getting ad data',
          details: scrapeError.message || 'Unknown error communicating with ScrapeCreators API'
        },
        { status: 500 }
      );
    }

    // Log completo de la estructura de datos para debugging
    console.log('=== ESTRUCTURA COMPLETA DE DATOS DE SCRAPECREATORS ===');
    console.log('Tipo de data:', typeof data);
    console.log('Data es null/undefined?', data === null || data === undefined);
    if (data) {
      console.log('Keys principales:', Object.keys(data));
      
      // Si data tiene 'message' y no tiene 'snapshot', intentar extraer de message
      if ('message' in data && !('snapshot' in data)) {
        console.log('⚠️ Data tiene "message" pero no "snapshot", verificando contenido...');
        console.log('Tipo de message:', typeof data.message);
        
        if (typeof data.message === 'string') {
          try {
            const parsed = JSON.parse(data.message);
            console.log('✅ Parseado exitoso de message como JSON');
            if (parsed && typeof parsed === 'object' && 'snapshot' in parsed) {
              console.log('✅ Datos válidos encontrados en message parseado');
              data = parsed;
            }
          } catch (e) {
            console.log('❌ No se pudo parsear message como JSON:', e);
          }
        } else if (data.message && typeof data.message === 'object' && 'snapshot' in data.message) {
          console.log('✅ Datos encontrados directamente en data.message');
          data = data.message;
        }
      }
      
      if (data.snapshot) {
        console.log('Keys de snapshot:', Object.keys(data.snapshot));
        console.log('snapshot.videos existe?', !!data.snapshot.videos);
        console.log('snapshot.videos es array?', Array.isArray(data.snapshot.videos));
        if (Array.isArray(data.snapshot.videos)) {
          console.log('snapshot.videos.length:', data.snapshot.videos.length);
          if (data.snapshot.videos.length > 0) {
            console.log('Primer video completo:', JSON.stringify(data.snapshot.videos[0], null, 2));
          }
        }
      } else {
        console.log('❌ No se encontró snapshot en data después de procesar');
        console.log('Data actual keys:', Object.keys(data || {}));
      }
    }
    
    // Buscar la URL del video en múltiples estructuras posibles
    let videoUrl: string | null = null;
    
    // 1. Buscar en snapshot.videos (estructura estándar) - PRIORIDAD: HD primero, luego SD
    if (data?.snapshot?.videos && Array.isArray(data.snapshot.videos) && data.snapshot.videos.length > 0) {
      console.log('✅ Encontrado snapshot.videos con', data.snapshot.videos.length, 'video(s)');
      const firstVideo = data.snapshot.videos[0];
      console.log('Keys del primer video:', Object.keys(firstVideo || {}));
      console.log('video_hd_url:', firstVideo?.video_hd_url ? 'EXISTE' : 'NO EXISTE');
      console.log('video_sd_url:', firstVideo?.video_sd_url ? 'EXISTE' : 'NO EXISTE');
      
      // Priorizar HD sobre SD
      videoUrl = firstVideo?.video_hd_url || firstVideo?.video_sd_url || firstVideo?.url || firstVideo?.video_url || null;
      
      if (videoUrl) {
        console.log('✅ URL del video encontrada en snapshot.videos:', videoUrl.substring(0, 100) + '...');
      } else {
        console.log('❌ No se encontró URL en el primer video');
      }
    } else {
      console.log('❌ snapshot.videos no existe o está vacío');
      if (data?.snapshot) {
        console.log('snapshot existe pero videos no:', Object.keys(data.snapshot));
      }
    }
    
    // 2. Buscar en snapshot.cards (estructura DCO - Dynamic Creative Optimization)
    if (!videoUrl && data?.snapshot?.cards && Array.isArray(data.snapshot.cards)) {
      console.log('Buscando en snapshot.cards, cantidad:', data.snapshot.cards.length);
      for (const card of data.snapshot.cards) {
        console.log('Card keys:', Object.keys(card || {}));
        if (card.video_sd_url || card.video_hd_url || card.video_url || card.url) {
          videoUrl = card.video_sd_url || card.video_hd_url || card.video_url || card.url || null;
          break;
        }
        // Buscar dentro de objetos anidados en cards
        if (card.video && typeof card.video === 'object') {
          videoUrl = card.video.url || card.video.video_sd_url || card.video.video_hd_url || null;
          if (videoUrl) break;
        }
        if (card.media && typeof card.media === 'object') {
          videoUrl = card.media.video_url || card.media.url || null;
          if (videoUrl) break;
        }
      }
    }
    
    // 3. Buscar en snapshot.body (algunas estructuras tienen el video aquí)
    if (!videoUrl && data?.snapshot?.body) {
      console.log('Buscando en snapshot.body');
      const body = data.snapshot.body;
      if (typeof body === 'object') {
        videoUrl = body.video_url || body.video_sd_url || body.video_hd_url || body.url || null;
        if (!videoUrl && body.video && typeof body.video === 'object') {
          videoUrl = body.video.url || body.video.video_sd_url || body.video.video_hd_url || null;
        }
      }
    }
    
    // 4. Buscar en snapshot.media
    if (!videoUrl && data?.snapshot?.media) {
      console.log('Buscando en snapshot.media');
      const media = data.snapshot.media;
      if (Array.isArray(media)) {
        for (const item of media) {
          if (item.type === 'video' || item.video_url || item.url) {
            videoUrl = item.video_url || item.url || item.video_sd_url || item.video_hd_url || null;
            if (videoUrl) break;
          }
        }
      } else if (typeof media === 'object') {
        videoUrl = media.video_url || media.url || media.video_sd_url || media.video_hd_url || null;
      }
    }
    
    // 5. Otras ubicaciones posibles en el nivel raíz
    if (!videoUrl) {
      console.log('Buscando en ubicaciones alternativas del nivel raíz');
      videoUrl = 
        data?.video_sd_url || 
        data?.video_hd_url ||
        data?.video_sd_urls?.[0] ||
        data?.video_hd_urls?.[0] ||
        data?.video?.sd_url || 
        data?.video?.hd_url ||
        data?.video?.video_sd_url ||
        data?.video?.video_hd_url ||
        data?.video?.url ||
        data?.video_url ||
        data?.videoUrl ||
        data?.media?.video?.url ||
        data?.media?.video_sd_url ||
        data?.media?.video_hd_url ||
        data?.ad_snapshot?.video_sd_url ||
        data?.ad_snapshot?.video_hd_url ||
        (data?.video && typeof data.video === 'string' ? data.video : null) ||
        (data?.videos && Array.isArray(data.videos) && data.videos[0]?.url ? data.videos[0].url : null);
    }
    
    console.log('URL del video encontrada:', videoUrl);
    console.log('Estructura disponible:', {
      hasVideos: !!data?.snapshot?.videos,
      videosLength: data?.snapshot?.videos?.length || 0,
      hasCards: !!data?.snapshot?.cards,
      cardsLength: data?.snapshot?.cards?.length || 0,
      hasBody: !!data?.snapshot?.body,
      hasMedia: !!data?.snapshot?.media
    });
    
    if (!videoUrl) {
      // Devolver error en lugar de success: false para que el frontend lo maneje
      return NextResponse.json({
        error: 'No video found in ad',
        details: 'The ad does not contain a video or the data structure is different than expected. Verify that the ad has a video and that the ID is correct.',
        adId,
        type,
        dataStructure: {
          hasSnapshot: !!data?.snapshot,
          snapshotKeys: data?.snapshot ? Object.keys(data.snapshot) : [],
          topLevelKeys: Object.keys(data || {})
        }
      }, { status: 404 });
    }

    // Validar y limpiar la URL del video
    let cleanVideoUrl = videoUrl;
    try {
      // Intentar parsear la URL para validarla
      const testUrl = new URL(videoUrl);
      cleanVideoUrl = testUrl.toString();
    } catch (urlError) {
      console.error('Error al parsear URL del video:', urlError);
      return NextResponse.json(
        { 
          error: 'Video URL is not valid',
          details: 'Could not parse the video URL correctly'
        },
        { status: 400 }
      );
    }

    // Descargar el video y subirlo a Gemini Files
    // IMPORTANTE: El video se descarga temporalmente en RAM (no en disco), se sube a Gemini, y luego la memoria se libera automáticamente
    // Para producción con muchos usuarios, el servidor necesita suficiente RAM para manejar múltiples descargas simultáneas
    console.log('Descargando video desde URL:', cleanVideoUrl);
    let myfile;
    let videoBuffer: Buffer | null = null;
    
    try {
      // Primero, hacer HEAD request para obtener el tamaño del video (opcional, para logging)
      try {
        const headResponse = await axios.head(cleanVideoUrl, {
          timeout: 10000,
          maxRedirects: 5
        });
        const contentLength = headResponse.headers['content-length'];
        if (contentLength) {
          const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
          console.log(`Tamaño del video: ${sizeMB} MB`);
        }
      } catch (headError) {
        // Si falla el HEAD, continuar igual
        console.log('No se pudo obtener el tamaño del video (HEAD request falló), continuando...');
      }
      
      // Descargar el video en memoria (RAM temporal, se libera después de subir)
      const videoResponse = await axios.get(cleanVideoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000, // 120 segundos para videos más largos
        maxRedirects: 5,
        maxContentLength: Infinity, // Sin límite de tamaño
        maxBodyLength: Infinity
      });
      
      videoBuffer = Buffer.from(videoResponse.data);
      console.log('Video descargado en RAM:', videoBuffer.length, 'bytes (', (videoBuffer.length / (1024 * 1024)).toFixed(2), 'MB)');
      
      if (videoBuffer.length === 0) {
        return NextResponse.json(
          { 
            error: 'Downloaded video is empty',
            details: 'El video no tiene contenido'
          },
          { status: 500 }
        );
      }
      
      // Convertir buffer a Blob para subirlo a Gemini Files
      const videoUint8Array = new Uint8Array(videoBuffer);
      const videoBlob = new Blob([videoUint8Array], { type: 'video/mp4' });
      
      // Subir el video a Gemini Files
      console.log('Subiendo video a Gemini Files...');
      myfile = await ai.files.upload({
        file: videoBlob,
        config: { mimeType: 'video/mp4' }
      });
      
      console.log('Video subido a Gemini:', myfile.uri);
      console.log('Estado inicial del archivo:', myfile.state);
      
      // Liberar la memoria explícitamente (aunque JavaScript lo hará automáticamente)
      videoBuffer = null;
      
    } catch (videoError: any) {
      // Asegurarse de liberar la memoria en caso de error
      videoBuffer = null;
      
      console.error('Error al descargar o subir el video:', videoError);
      
      // Manejar específicamente errores de API key inválida
      if (videoError.message?.includes('API key not valid') || 
          videoError.message?.includes('API_KEY_INVALID') ||
          videoError.status === 400 && videoError.message?.includes('API key')) {
        console.error('❌ Error: API key de Google Gemini no es válida');
        console.error('API key usada (primeros 10 chars):', googleApiKey ? `${googleApiKey.substring(0, 10)}...` : 'NO DEFINIDA');
        
        return NextResponse.json(
          { 
            error: 'Google Gemini API key is not valid',
            details: 'The Google Gemini API key is not valid or has expired. Please verify your API key in the .env.local file and restart the server. Get a new API key at: https://aistudio.google.com/apikey'
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Error processing video',
          details: videoError.message || 'Could not download or upload the video. The video may be too large or the URL is not accessible.'
        },
        { status: 500 }
      );
    }

    // Esperar a que el archivo esté en estado ACTIVE
    console.log('Esperando a que el archivo esté listo...');
    const maxWaitTime = 60000; // 60 segundos máximo
    const checkInterval = 2000; // Verificar cada 2 segundos
    const startTime = Date.now();
    
    // Obtener el nombre del archivo (puede estar en name o extraerse del URI)
    let fileName = myfile.name;
    if (!fileName && myfile.uri) {
      // Extraer el nombre del URI: files/dew0643ff2jn -> dew0643ff2jn
      const uriParts = myfile.uri.split('/');
      fileName = uriParts[uriParts.length - 1];
    }
    
    // Si el archivo ya está ACTIVE, no necesitamos esperar
    if (myfile.state === 'ACTIVE') {
      console.log('Archivo ya está en estado ACTIVE, procediendo con el análisis...');
    } else {
      console.log(`Estado inicial: ${myfile.state}, esperando ACTIVE...`);
      
      while (myfile.state !== 'ACTIVE') {
        // Verificar timeout
        if (Date.now() - startTime > maxWaitTime) {
          return NextResponse.json(
            { 
              error: 'Timeout waiting for file to be ready',
              details: `El archivo no alcanzó el estado ACTIVE después de ${maxWaitTime / 1000} segundos. Estado actual: ${myfile.state}`
            },
            { status: 500 }
          );
        }

        // Esperar antes de verificar de nuevo
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
        // Obtener el estado actual del archivo
        try {
          if (fileName) {
            const fileInfo = await ai.files.get({ name: fileName });
            myfile = fileInfo;
            console.log(`Estado del archivo: ${myfile.state} (esperando ACTIVE)...`);
          } else {
            console.warn('No se pudo obtener el nombre del archivo para verificar el estado');
            // Esperar un poco más y asumir que está listo
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
          }
        } catch (checkError: any) {
          console.error('Error al verificar estado del archivo:', checkError);
          // Continuar intentando
        }
      }
      
      console.log('Archivo listo en estado ACTIVE, procediendo con el análisis...');
    }

    // Detectar idioma del usuario si hay productService
    let userLanguage = 'en'; // default
    if (productService && productService.trim()) {
      userLanguage = detectLanguage(productService);
    }

    // Crear prompt según el tipo de análisis
    let analysisPrompt = '';
    switch (type) {
      case 'psychological':
        analysisPrompt = 'You are an expert Meta Ads psychologist. Analyze this Facebook/Instagram ad focusing on psychological triggers. Provide a concise but powerful analysis covering: 1) **Emotional Journey** - second-by-second emotional arc (curiosity, fear, desire, urgency), 2) **Psychological Triggers** - Cialdini principles (social proof, scarcity, authority), cognitive biases (loss aversion, FOMO, anchoring), 3) **Hook Analysis** (first 3s) - pattern interrupt strength, scroll-stop potential, 4) **Desire Architecture** - problem-agitation-solution flow, pain points, aspirations, 5) **Subconscious Elements** - music tempo/mood, color psychology, editing pace, visual hierarchy to CTA, 6) **Target Audience** - psychographic profile, pain points, desires, identity signals, 7) **Decision Triggers** - System 1 vs System 2 ratio, impulse vs considered purchase, 8) **Friction Reduction** - removed friction points (pricing clarity, social proof, risk reversal), 9) **Key Scenes** - psychological purpose of major frames, 10) **Replication Blueprint** - critical elements for AI video recreation (Sora/Veo), timing recommendations. Be concise, use timestamps, explain WHY each element works. Format with clear sections and bold headers.';
        break;
      case 'storytelling':
        analysisPrompt = 'You are an expert narrative designer. Analyze this Facebook/Instagram ad through a storytelling lens. Provide a concise but powerful analysis covering: 1) **Narrative Structure** - story framework (Hero\'s Journey, Before/After, Problem/Solution, Testimonial, Day-in-life), three-act structure with timestamps (setup/confrontation/resolution), inciting incident, 2) **Character** - protagonist type (customer, founder, hero), relatability triggers, transformation arc, antagonist/obstacle, 3) **Conflict & Stakes** - core tension, emotional stakes, urgency, peak dramatic moment, 4) **Story Beats** - major beats with timestamps, rhythm/tempo, plot points, information reveal strategy, 5) **Voice** - narrative voice (1st/2nd/3rd person, VO style), dialogue authenticity, memorable phrases, text overlay contribution, 6) **Visual Storytelling** - symbolic imagery, color grading shifts, camera angles, visual motifs, transitions, 7) **Themes** - underlying message (empowerment, transformation, belonging), universal truths, cultural context, 8) **Emotional Arc** - emotional journey (hope/struggle/breakthrough vs fear/discovery/relief), cathartic moments, vulnerability usage, 9) **Authenticity** - polished vs raw balance, genuine vs manufactured markers, production quality role, 10) **Story-to-CTA** - narrative-to-CTA bridge, earned vs forced CTA, organic product integration, 11) **Replication Blueprint** - shot list with narrative purpose, essential beats, timing per act, visual metaphors to maintain, voice/tone requirements, dialogue structure, non-negotiable vs adaptable elements. Be concise, use timestamps, explain WHY each choice works. Format with clear sections and bold headers.';
        break;
      case 'production':
        const langInstruction = userLanguage === 'es' 
          ? 'Genera el prompt en ESPAÑOL.' 
          : 'Generate the prompt in ENGLISH.';
        analysisPrompt = `Analyze this ad video and generate a detailed prompt in a single paragraph that describes exactly how to recreate this video. The prompt must include: all visual actions and scenes in chronological order, lighting configuration (natural, artificial, hyperrealistic), camera movements and angles, all text overlays with their exact content and visual design (colors, fonts, graphics, placement) if present, whether there's voiceover or only text overlay, visual quality and hyperrealism requirements, and format and aspect ratio. Generate ONLY the prompt as ONE continuous paragraph without headers, sections, bullet points, or labels. Integrate all information naturally and fluidly. ${langInstruction}`;
        break;
      default:
        analysisPrompt = 'Analiza este video de anuncio publicitario en detalle.';
    }

    // Analizar el video con Gemini
    console.log('Analizando video con Gemini...');
    let result;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: myfile.uri,
                  mimeType: myfile.mimeType
                }
              },
              {
                text: analysisPrompt
              }
            ]
          }
        ]
      });
    } catch (geminiError: any) {
      console.error('Error al llamar a Gemini:', geminiError);
      return NextResponse.json(
        { 
          error: 'Error analyzing video with Gemini',
          details: geminiError.message || 'Could not process the video with AI',
          geminiError: geminiError.response?.data || geminiError.message
        },
        { status: 500 }
      );
    }

    // Obtener el texto de la respuesta
    let analysisText = 'Could not get analysis';
    let analysisError = null;
    try {
      // La respuesta de Gemini tiene la estructura: result.candidates[0].content.parts[0].text
      if (result.candidates && result.candidates[0]?.content?.parts) {
        const textParts = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');
        if (textParts && textParts.trim().length > 0) {
          analysisText = textParts;
        } else {
          analysisError = 'Response has empty text parts';
          console.error('Response has empty text parts. Full result:', JSON.stringify(result, null, 2));
        }
      } else if ((result as any).text) {
        const text = (result as any).text;
        if (text && text.trim().length > 0) {
          analysisText = text;
        } else {
          analysisError = 'Response text is empty';
          console.error('Response text is empty. Full result:', JSON.stringify(result, null, 2));
        }
      } else {
        analysisError = 'Unexpected response structure';
        console.error('Estructura inesperada de la respuesta de Gemini:', JSON.stringify(result, null, 2));
      }
    } catch (err) {
      analysisError = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error al extraer texto de la respuesta:', err);
      console.error('Estructura de result:', JSON.stringify(result, null, 2));
    }
    
    // If analysis failed, return error early
    if (!analysisText || analysisText === 'Could not get analysis' || analysisText.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to generate production prompt',
          details: analysisError || 'Could not extract analysis text from Gemini response',
          geminiResponse: process.env.NODE_ENV === 'development' ? result : undefined
        },
        { status: 500 }
      );
    }
    
    // Extraer información de uso y calcular costo
    let usageInfo = null;
    let costInfo = null;
    try {
      // La respuesta de Gemini incluye usageMetadata
      const usageMetadata = (result as any).usageMetadata;
      if (usageMetadata) {
        const promptTokenCount = usageMetadata.promptTokenCount || 0;
        const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
        const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

        // Precios de Gemini 3 Flash Preview (por millón de tokens)
        // Input: $0.50 por millón de tokens
        // Output: $3 por millón de tokens
        const inputCostPerMillion = 0.5;
        const outputCostPerMillion = 3.0;

        const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
        const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
        const totalCost = inputCost + outputCost;

        usageInfo = {
          promptTokenCount,
          candidatesTokenCount,
          totalTokenCount
        };

        costInfo = {
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
          inputCostFormatted: `$${inputCost.toFixed(6)}`,
          outputCostFormatted: `$${outputCost.toFixed(6)}`,
          totalCostFormatted: `$${totalCost.toFixed(6)}`
        };

        // Log para debugging
        console.log('Token Usage:', usageInfo);
        console.log('Cost:', costInfo);
      }
    } catch (err) {
      console.error('Error extracting usage information:', err);
    }
    
    // If production type and productService is provided, generate adapted prompt
    // BUT only if we successfully got the original analysis
    let adaptedPrompt = null;
    const hasValidAnalysis = analysisText && 
                             analysisText !== 'Could not get analysis' && 
                             analysisText.trim().length > 0;
    
    if (type === 'production' && productService && productService.trim() && hasValidAnalysis) {
      console.log('Generating adapted prompt for product/service:', productService);
      console.log('Original prompt length:', analysisText.length);
      console.log('Has product image:', !!productImage);
      
      try {
        // Upload product image if provided
        let productImageFile = null;
        if (productImage) {
          try {
            console.log('Uploading product image to Gemini Files...');
            const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');
            let productMime = productImage.split(';')[0].split(':')[1] || 'image/png';
            
            // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
            const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
            if (!supportedFormats.includes(productMime.toLowerCase())) {
              console.log(`Converting unsupported format ${productMime} to PNG`);
              productMime = 'image/png';
            }
            
            const productUint8Array = new Uint8Array(productBuffer);
            const productBlob = new Blob([productUint8Array], { type: productMime });
            productImageFile = await ai.files.upload({
              file: productBlob,
              config: { mimeType: productMime }
            });
            console.log('Product image uploaded:', productImageFile.uri);
            
            // Wait for file to be ACTIVE
            const maxWaitTime = 60000;
            const checkInterval = 2000;
            const startTime = Date.now();
            
            const waitForFile = async (file: any, fileName: string) => {
              if (file.state === 'ACTIVE') return file;
              
              while (file.state !== 'ACTIVE') {
                if (Date.now() - startTime > maxWaitTime) {
                  throw new Error(`Timeout waiting for ${fileName} to be ready`);
                }
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                
                try {
                  const fileInfo = await ai.files.get({ name: fileName });
                  file = fileInfo;
                } catch (err) {
                  console.error(`Error checking file status for ${fileName}:`, err);
                }
              }
              return file;
            };
            
            const productFileName = productImageFile.name || productImageFile.uri?.split('/').pop() || '';
            if (productFileName) {
              productImageFile = await waitForFile(productImageFile, productFileName);
            }
            
            if (!productImageFile.uri) {
              console.warn('Product image file missing URI, continuing without image');
              productImageFile = null;
            }
          } catch (imageError: any) {
            console.error('Error uploading product image:', imageError);
            console.warn('Continuing with text-only adaptation');
            productImageFile = null;
          }
        }
        
        const targetLanguage = detectLanguage(productService);
        const langText = targetLanguage === 'es' ? 'español' : 'english';
        const langInstructions = targetLanguage === 'es' 
          ? {
              intro: 'Tienes un prompt detallado que describe un video de un anuncio publicitario. Adapta ese prompt al producto o servicio del usuario, manteniendo la misma estructura técnica (iluminación, cámara, cortes, transiciones, estilo visual) pero transformando todas las acciones y visuales para que sean coherentes con el producto/servicio del usuario.',
              original: 'PROMPT ORIGINAL DEL VIDEO:',
              product: 'PRODUCTO/SERVICIO A ADAPTAR:',
              image: 'IMAGEN DEL PRODUCTO: Tienes una imagen del producto. Úsala para describir con precisión su apariencia, colores, materiales, texturas, forma, tamaño y branding en el prompt adaptado.',
              instructions: 'Transforma todas las acciones para que muestren cómo se usa',
              output: 'Genera ÚNICAMENTE el prompt adaptado en ESPAÑOL, en UN SOLO párrafo continuo sin saltos de línea, encabezados ni formato adicional.'
            }
          : {
              intro: 'You have a detailed prompt that describes an ad video. Adapt that prompt to the user\'s product/service, maintaining the same technical structure (lighting, camera, cuts, transitions, visual style) but transforming all actions and visuals to be coherent with the user\'s product/service.',
              original: 'ORIGINAL VIDEO PROMPT:',
              product: 'PRODUCT/SERVICE TO ADAPT TO:',
              image: 'PRODUCT IMAGE: You have access to a product image. Use it to accurately describe its appearance, colors, materials, textures, shape, size, and branding in the adapted prompt.',
              instructions: 'Transform all actions to show how',
              output: 'Generate ONLY the adapted prompt in ENGLISH, as ONE continuous paragraph without line breaks, headers, or additional formatting.'
            };
        
        const adaptationPrompt = `${langInstructions.intro}

${langInstructions.original}
${analysisText}

${langInstructions.product}
"${productService}"
${productImageFile ? `${langInstructions.image}` : ''}

INSTRUCTIONS:
${langInstructions.instructions} "${productService}" in a logical and coherent way. Adapt all visual descriptions to show "${productService}" instead of the original product. If there are text overlays or voiceover, adapt their content to be relevant to "${productService}" but maintain the same design, colors, graphics, placement, and style. Preserve the same lighting, camera movements, angles, cuts, transitions, pacing, format, and aspect ratio from the original.

${langInstructions.output}`;

        const adaptationParts: any[] = [
          {
            text: adaptationPrompt
          }
        ];
        
        // Add product image if available
        if (productImageFile && productImageFile.uri) {
          adaptationParts.unshift({
            fileData: {
              fileUri: productImageFile.uri,
              mimeType: productImageFile.mimeType
            }
          });
        }

        const adaptationResult = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: adaptationParts
            }
          ]
        });

        let adaptationText = '';
        if (adaptationResult.candidates && adaptationResult.candidates[0]?.content?.parts) {
          adaptationText = adaptationResult.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('');
        } else if ((adaptationResult as any).text) {
          adaptationText = (adaptationResult as any).text;
        }

        if (adaptationText && adaptationText.trim().length > 0) {
          adaptedPrompt = adaptationText.trim();
          console.log('Adapted prompt generated successfully, length:', adaptedPrompt.length);
          console.log('Adapted prompt preview:', adaptedPrompt.substring(0, 200));
          
          // Calculate costs for adaptation (server-side only)
          try {
            const adaptationUsageMetadata = (adaptationResult as any).usageMetadata;
            if (adaptationUsageMetadata) {
              const adaptPromptTokens = adaptationUsageMetadata.promptTokenCount || 0;
              const adaptCandidatesTokens = adaptationUsageMetadata.candidatesTokenCount || 0;
              const adaptTotalTokens = adaptationUsageMetadata.totalTokenCount || (adaptPromptTokens + adaptCandidatesTokens);

              const inputCostPerMillion = 0.5;
              const outputCostPerMillion = 3.0;

              const adaptInputCost = (adaptPromptTokens / 1_000_000) * inputCostPerMillion;
              const adaptOutputCost = (adaptCandidatesTokens / 1_000_000) * outputCostPerMillion;
              const adaptTotalCost = adaptInputCost + adaptOutputCost;

              console.log('\n=== ADAPTED PROMPT GENERATION COST ===');
              console.log(`Input tokens: ${adaptPromptTokens.toLocaleString()}, Cost: $${adaptInputCost.toFixed(6)}`);
              console.log(`Output tokens: ${adaptCandidatesTokens.toLocaleString()}, Cost: $${adaptOutputCost.toFixed(6)}`);
              console.log(`Total tokens: ${adaptTotalTokens.toLocaleString()}, Total cost: $${adaptTotalCost.toFixed(6)}`);
            }
          } catch (adaptCostError) {
            console.error('Error calculating adaptation costs:', adaptCostError);
          }
        } else {
          console.warn('Adapted prompt text is empty or invalid');
          adaptedPrompt = null;
        }
      } catch (adaptationError: any) {
        console.error('Error generating adapted prompt:', adaptationError);
        console.error('Error details:', adaptationError.message);
        adaptedPrompt = null;
        // Don't fail the whole request if adaptation fails, just log it
      }
    } else if (type === 'production' && productService && productService.trim() && !hasValidAnalysis) {
      console.warn('Cannot generate adapted prompt: original analysis was not obtained successfully');
      console.warn('Analysis text:', analysisText);
      adaptedPrompt = null;
    } else if (type === 'production' && (!productService || !productService.trim())) {
      console.log('No product/service provided, skipping adapted prompt generation');
      adaptedPrompt = null;
    }
    
    console.log('Análisis completado');
    console.log('Adapted prompt final value:', adaptedPrompt ? `Present (${adaptedPrompt.length} chars)` : 'null');

    // Si hay productService y adaptedPrompt, solo devolver el adapted prompt
    // Si no hay productService o no se generó adaptedPrompt, devolver el análisis original
    if (type === 'production' && productService && productService.trim() && adaptedPrompt) {
      // Solo devolver adapted prompt cuando hay productService
      return NextResponse.json({
        success: true,
        adId,
        type,
        data,
        geminiAnalysis: {
          text: adaptedPrompt,
          fileUri: myfile.uri
        },
        adaptedPrompt: adaptedPrompt,
        usage: usageInfo
      });
    } else {
      // Devolver análisis original
      return NextResponse.json({
        success: true,
        adId,
        type,
        data,
        geminiAnalysis: {
          text: analysisText,
          fileUri: myfile.uri
        },
        adaptedPrompt: null,
        usage: usageInfo
      });
    }

  } catch (error: any) {
    console.error('Error al analizar el anuncio:', error);
    console.error('Stack trace:', error.stack);
    
    // Manejar diferentes tipos de errores
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data;
      const errorMessage = error.message;
      
      console.error('Error de Axios:', {
        status,
        message: errorMessage,
        data: errorData,
        url: error.config?.url
      });
      
      return NextResponse.json(
        { 
          error: 'Error getting ad data',
          details: errorData 
            ? (typeof errorData === 'string' ? errorData : JSON.stringify(errorData))
            : errorMessage,
          statusCode: status
        },
        { status }
      );
    }

    // Error de Gemini u otro error
    const errorMessage = error.message || 'Unknown error';
    console.error('Error general:', errorMessage);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

