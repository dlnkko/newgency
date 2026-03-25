import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

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

    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) {
      return creditError;
    }

    // Initialize AI client at runtime (uses user's API key if configured)
    const ai = await getGoogleGenAI(request);
    const body = await request.json();
    const { metaAdUrl, socialMediaUrl, video } = body;

    if ((!metaAdUrl || !metaAdUrl.trim()) && (!socialMediaUrl || !socialMediaUrl.trim()) && !video) {
      return NextResponse.json(
        { error: 'Either Meta Ad URL, Instagram/TikTok URL, or uploaded video is required' },
        { status: 400 }
      );
    }

    let videoFile: any = null;
    let contentType: 'metaAd' | 'socialMedia' | 'uploaded' = metaAdUrl ? 'metaAd' : (socialMediaUrl ? 'socialMedia' : 'uploaded');
    
    // Handle uploaded video first
    if (video) {
      try {
        console.log('Processing uploaded video...');
        const videoBuffer = Buffer.from(video.split(',')[1], 'base64');
        const videoUint8Array = new Uint8Array(videoBuffer);
        const videoBlob = new Blob([videoUint8Array], { type: 'video/mp4' });
        
        // Upload video to Gemini Files
        console.log('Uploading video to Gemini Files...');
        let myfile = await ai.files.upload({
          file: videoBlob,
          config: { mimeType: 'video/mp4' }
        });
        
        console.log('Video uploaded to Gemini:', myfile.uri);
        
        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        let fileName = myfile.name;
        if (!fileName && myfile.uri) {
          const uriParts = myfile.uri.split('/');
          fileName = uriParts[uriParts.length - 1];
        }
        
        if (myfile.state === 'ACTIVE') {
          console.log('File already ACTIVE, proceeding...');
        } else {
          console.log(`Initial state: ${myfile.state}, waiting for ACTIVE...`);
          
          while (myfile.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              return NextResponse.json(
                { 
                  error: 'Timeout waiting for file to be ready',
                  details: `File did not reach ACTIVE state after ${maxWaitTime / 1000} seconds. Current state: ${myfile.state}`
                },
                { status: 500 }
              );
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
            
            try {
              if (fileName) {
                const fileInfo = await ai.files.get({ name: fileName });
                myfile = fileInfo;
                console.log(`File state: ${myfile.state} (waiting for ACTIVE)...`);
              } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
                break;
              }
            } catch (checkError: any) {
              console.error('Error checking file status:', checkError);
            }
          }
          
          console.log('File ready in ACTIVE state, proceeding with analysis...');
        }
        
        videoFile = myfile;
        console.log('Video file ready for analysis:', videoFile.uri);
      } catch (uploadError: any) {
        console.error('Error uploading video:', uploadError);
        
        if (uploadError.message?.includes('API key not valid') || 
            uploadError.message?.includes('API_KEY_INVALID') ||
            uploadError.status === 400 && uploadError.message?.includes('API key')) {
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
            error: 'Error processing uploaded video',
            details: uploadError.message || 'Could not upload the video to Gemini Files. The video may be too large.'
          },
          { status: 500 }
        );
      }
    }

    // Handle Social Media URL (Instagram/TikTok) - only if no video was uploaded
    if (socialMediaUrl && socialMediaUrl.trim() && !videoFile) {
      const isInstagram = socialMediaUrl.includes('instagram.com/reel') || socialMediaUrl.includes('instagram.com/p/');
      const isTikTok = socialMediaUrl.includes('tiktok.com');

      if (!isInstagram && !isTikTok) {
        return NextResponse.json(
          { error: 'Invalid URL. Please provide an Instagram Reel or TikTok URL.' },
          { status: 400 }
        );
      }

      // Extract video URL using scrapecreators
      try {
        const scrapeCreatorsApiKey = getScrapeCreatorsApiKey();
        let videoUrl: string | null = null;
        
        if (isTikTok) {
          // TikTok: usar v2 API
          const response = await axios.get(
            `https://api.scrapecreators.com/v2/tiktok/video?url=${encodeURIComponent(socialMediaUrl)}&trim=true`,
            {
              headers: { 'x-api-key': scrapeCreatorsApiKey }
            }
          );
          
          const data = response.data;
          // Extraer URL del video desde aweme_detail -> video -> play_addr -> url_list[0]
          if (data?.aweme_detail?.video?.play_addr?.url_list && Array.isArray(data.aweme_detail.video.play_addr.url_list) && data.aweme_detail.video.play_addr.url_list.length > 0) {
            // Buscar el URL que empieza con https://v16-webapp-prime...
            videoUrl = data.aweme_detail.video.play_addr.url_list.find((url: string) => url.startsWith('https://v16-webapp-prime.tiktok.com')) || data.aweme_detail.video.play_addr.url_list[0];
          }
          
          if (!videoUrl) {
            return NextResponse.json(
              { error: 'Could not extract video URL from TikTok. The video may not be available.' },
              { status: 400 }
            );
          }
        } else if (isInstagram) {
          // Instagram: usar v1 API
          const response = await axios.get(
            `https://api.scrapecreators.com/v1/instagram/post?url=${encodeURIComponent(socialMediaUrl)}&trim=true`,
            {
              headers: { 'x-api-key': scrapeCreatorsApiKey }
            }
          );
          
          const data = response.data;
          // Extraer video_url desde xdt_shortcode_media.video_url
          if (data?.xdt_shortcode_media?.video_url) {
            videoUrl = data.xdt_shortcode_media.video_url;
          }
          
          if (!videoUrl) {
            return NextResponse.json(
              { error: 'Could not extract video URL from Instagram. The post may not be a video or may not be available.' },
              { status: 400 }
            );
          }
        }

        if (!videoUrl) {
          return NextResponse.json(
            { error: 'Could not extract video URL from social media post. The video may not be available.' },
            { status: 400 }
          );
        }

        console.log('Video URL extracted:', videoUrl.substring(0, 100) + '...');

        // Validar y limpiar la URL del video
        let cleanVideoUrl = videoUrl;
        try {
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
        
        videoFile = myfile;
        console.log('Video file ready for analysis:', videoFile.uri);
      } catch (scrapeError: any) {
        console.error('Error extracting video URL:', scrapeError);
        return NextResponse.json(
          { 
            error: 'Failed to extract video URL',
            details: scrapeError.response?.data?.message || scrapeError.message || 'Could not access video data'
          },
          { status: 500 }
        );
      }
    }

    // Handle Meta Ad URL - only if no video was uploaded
    if (metaAdUrl && metaAdUrl.trim() && !videoFile) {
      // Extraer el ID de la URL de Facebook Ads Library
      let adId: string | null = null;
      try {
        const urlObj = new URL(metaAdUrl);
        adId = urlObj.searchParams.get('id');
      } catch (urlError) {
        const idMatch = metaAdUrl.match(/[?&]id=(\d+)/);
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
        `https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${adId}&get_transcript=true`,
        {
          headers: {
            'x-api-key': scrapeCreatorsApiKey
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
      videoFile = myfile;
    }
    } // Cerrar el bloque if (metaAdUrl && metaAdUrl.trim())

    // Detectar idioma del análisis (usar inglés por defecto ya que no tenemos input del usuario)
    const userLanguage = 'en';

    // Create unified analysis prompt
    const contentDescription = contentType === 'metaAd' 
      ? 'this video ad' 
      : contentType === 'socialMedia'
      ? 'this social media video post'
      : 'this uploaded video';
    
    const contentInput = videoFile
      ? `You have access to a video file. Analyze the video visually and any audio/transcript available.`
      : `Analyze the content based on the available information.`;

    const analysisPrompt = `You are an expert marketing psychologist and creative strategist specializing in Wundt's psychological principles. Analyze ${contentDescription} to provide comprehensive insights about why it worked and deep truths about the audience.

${contentInput}

**YOUR COMPREHENSIVE ANALYSIS:**

**Part 0: Complete Script Transcription**

**COMPLETE SCRIPT:**
[Provide a complete, word-for-word transcription of ALL dialogue, voiceover, narration, text overlays, captions, and any spoken or written words in the video. Present it as a continuous paragraph or text block. Include every word exactly as it appears or is spoken, maintaining the original language and phrasing. If there are text overlays, indicate them clearly. If there are multiple speakers or sections, separate them but include everything. This should be the FULL script from start to finish.]

---

**Part 1: Deep Psychological Analysis**

Provide a comprehensive psychological analysis using Wundt's principles. Analyze:

**1. Deep Script and Hook Analysis:**
   - **Analyze the complete script** (refer to the Complete Script Transcription above): Break down the script into key sections (hook, body, CTA) and analyze each section in detail.
   - **Hook Analysis - Why it worked:**
     * What exact words, phrases, or statements were used in the hook (first 3-5 seconds)?
     * What made the opening compelling from a psychological perspective?
     * Which Wundtian principles (attention, emotion, perception) were activated in the hook?
     * What specific elements (visual, auditory, narrative) made people stop scrolling?
     * What psychological mechanisms captured immediate attention?
     * Why did these specific words/phrases work? What emotional or cognitive response did they trigger?
   - **Script Structure Analysis:**
     * How is the script structured? (Problem-Agitate-Solve, Story-Transformation, Question-Answer, etc.)
     * What is the narrative arc? How does the script build tension, curiosity, or emotional investment?
     * At what specific moments in the script does engagement peak? Why?
     * What transitions or pivot points in the script maintain attention?
     * How does the script pace information delivery? (Fast vs slow, dense vs sparse)
   - **Why Specific Script Elements Worked:**
     * Identify 3-5 key phrases, statements, or moments in the script that were particularly effective
     * For each, explain: What was said exactly? Why did it work psychologically? What emotion or thought did it trigger? What made it memorable or impactful?
     * How did the script use language patterns (repetition, contrast, questions, statements) to create impact?
     * What rhetorical devices were used (metaphors, analogies, direct address, storytelling) and why were they effective?
   - **Script-Audience Connection:**
     * What specific words or phrases in the script resonated with the target audience? Why?
     * How did the script speak the audience's language? (slang, terminology, references, cultural touchpoints)
     * What unspoken thoughts or feelings did the script articulate for the audience?
     * How did the script validate, challenge, or transform the audience's perspective?

**2. Why the Video Had Engagement:**
   - What elements drove viewers to engage (like, comment, share, watch until the end)?
   - How did the content maintain attention throughout?
   - What psychological triggers kept viewers engaged?
   - What made the content shareable or worth commenting on?
   - **Script-driven engagement**: How did specific script moments create engagement spikes? What was said at those moments?

**3. Why This Content Connected with This Audience:**
   - What specific things did the content say or show that resonated with the audience?
   - What hidden truths or unspoken thoughts did it touch upon?
   - What did the audience identify with? (values, beliefs, experiences, desires, fears, aspirations)
   - What made the audience feel understood or seen?
   - What emotional connection was established and how?

**4. Pain Points and Emotional Triggers:**
   - What specific problems, frustrations, or desires did this content identify and address?
   - What pain points did it touch that the audience experiences?
   - What emotional states does it target (fear, desire, hope, relief, validation, belonging, etc.)?
   - How did it address these pain points in a way that resonated?

**5. Structural Elements (Wundt's Elemental Psychology):**
   - What are the basic sensory elements (visual, auditory, emotional) that compose the experience?
   - How do these elements combine to create a complex emotional experience?
   - Which specific visual, auditory, or narrative elements trigger immediate attention?

**6. Emotional Response Mechanisms (Wundt's Three-Dimensional Theory of Feeling):**
   - **Pleasure-Displeasure**: What elements create pleasure or relieve displeasure in the viewer?
   - **Arousal-Calm**: What elements create excitement, tension, or calm?
   - **Strain-Relaxation**: What elements create tension and release, building emotional engagement?
   - Explain which specific elements likely drive the strongest emotional response and why

**7. Attention and Perception (Wundt's Principles):**
   - How does the content capture and maintain attention?
   - What perceptual elements (contrast, movement, novelty) create immediate engagement?
   - How does the structure guide the viewer's attention through the experience?

**8. Script Replication Strategy:**
   - **Replicable Script Patterns:**
     * What script structures, formats, or frameworks can be replicated? (e.g., "Problem-Agitate-Solve", "Before-After-Bridge", "Story-Transformation")
     * What specific hook formulas or opening patterns worked? How can they be adapted?
     * What language patterns, rhetorical devices, or speaking styles were effective?
     * What script pacing, rhythm, or information delivery methods worked?
   - **Replicable Phrases and Language:**
     * List 5-10 specific phrases, questions, or statements from the script that can be adapted
     * For each, explain: What made it work? How can it be modified for different products/audiences?
     * What word choices, tone, or linguistic patterns created impact?
   - **Script Timing and Pacing:**
     * At what seconds did key script moments occur? (e.g., "Hook at 0-3s", "Problem statement at 5-8s", "Solution at 15-20s")
     * What was the optimal information density? (How much information per second?)
     * How did script timing align with visual moments? What made this effective?
   - **Hook Replication Formula:**
     * What is the exact hook structure? (Question? Statement? Story opening? Visual + audio combo?)
     * What elements made the hook work? (Curiosity gap? Emotional trigger? Relatable statement? Bold claim?)
     * How can this hook formula be replicated with different products/audiences?
   - **Script-to-Visual Synchronization:**
     * How did the script complement or contrast with visuals? What made this effective?
     * What script moments were enhanced by specific visuals? How?
     * What visual-script combinations created the strongest impact?

**9. What You Can Replicate (Overall Strategy):**
   - Based on all the insights above, what specific elements, strategies, or approaches can be replicated?
   - What psychological principles can be applied to other content?
   - What structural elements worked and why?
   - What emotional triggers were most effective?
   - **Complete Replication Blueprint**: Provide a step-by-step blueprint for replicating this ad's success, including script structure, hook formula, key phrases, timing, and visual-script synchronization.

**Part 2: Audience Insights**

After the comprehensive analysis above, provide:

AUDIENCE: [Estimate the target audience that engaged with this video. Example: "Men aged 19-25 who are fitness enthusiasts and active on social media" or "Working mothers aged 28-40 seeking work-life balance"]

---

INSIGHT 1: [One clear, deep hidden truth about this audience]

[Brief context: What in the video revealed this insight. What this tells us about the audience's psychology, needs, pain points, or hidden truths. Keep it focused - 2-3 sentences max.]

---

INSIGHT 2: [Another deep hidden truth about this audience]

[Brief context: What in the video revealed this insight. What this tells us about the audience's psychology, needs, pain points, or hidden truths. Keep it focused - 2-3 sentences max.]

---

INSIGHT 3: [Another deep hidden truth about this audience]

[Brief context: What in the video revealed this insight. What this tells us about the audience's psychology, needs, pain points, or hidden truths. Keep it focused - 2-3 sentences max.]

**OUTPUT FORMAT:**
1. **FIRST**: Start with "Part 0: Complete Script Transcription" - provide the COMPLETE SCRIPT as a continuous paragraph/text block with every word transcribed (dialogue, voiceover, narration, text overlays, captions - everything)
2. Then provide the comprehensive psychological analysis (sections 1-9 above)
   - **CRITICAL**: In section 1, reference the Complete Script Transcription and analyze it in extreme detail, explaining why specific words, phrases, and moments worked
   - **CRITICAL**: Provide specific timestamps for key script moments when possible
3. Then provide "AUDIENCE:" estimation
4. Then provide exactly 3 insights labeled "INSIGHT 1:", "INSIGHT 2:", "INSIGHT 3:"
5. Separate the audience section and insights with "---" on its own line
6. All content must be in English
7. **IMPORTANT**: Focus heavily on script analysis - this is critical for understanding and replicating the ad's success`;

    // Analyze with Gemini
    console.log('Analyzing content with Gemini...');
    let analysisResult;
    let geminiCost = 0; // Declarar al inicio para que esté disponible en todo el scope
    try {
      const analysisParts: any[] = [];
      
      // Add video file if available (Meta Ad or Social Media)
      if (videoFile && videoFile.uri) {
        analysisParts.push({
          fileData: {
            fileUri: videoFile.uri,
            mimeType: videoFile.mimeType
          }
        });
      }
      
      // Add text prompt
      analysisParts.push({
        text: analysisPrompt
      });

      analysisResult = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: analysisParts
          }
        ]
      });

      // Calcular costos de Gemini
      try {
        const usageMetadata = (analysisResult as any).usageMetadata;
        if (usageMetadata) {
          const promptTokenCount = usageMetadata.promptTokenCount || 0;
          const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;

          // Precios de Gemini 3 Flash Preview (por millón de tokens)
          // Input: $0.50 por millón de tokens
          // Output: $3.00 por millón de tokens
          const inputCost = (promptTokenCount / 1_000_000) * 0.5;
          const outputCost = (candidatesTokenCount / 1_000_000) * 3.0;
          geminiCost = inputCost + outputCost;

          console.log('\n=== COSTO GEMINI (Análisis de Video) ===');
          console.log(`Input tokens: ${promptTokenCount.toLocaleString()}, Costo: $${inputCost.toFixed(6)}`);
          console.log(`Output tokens: ${candidatesTokenCount.toLocaleString()}, Costo: $${outputCost.toFixed(6)}`);
          console.log(`Costo total Gemini: $${geminiCost.toFixed(6)}`);
        }
      } catch (costError) {
        console.error('Error calculando costos del análisis:', costError);
      }
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

    // Extract analysis text
    let fullAnalysisText = '';
    try {
      if (analysisResult.candidates && analysisResult.candidates[0]?.content?.parts) {
        fullAnalysisText = analysisResult.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');
      } else if ((analysisResult as any).text) {
        fullAnalysisText = (analysisResult as any).text;
      }
    } catch (err) {
      console.error('Error extracting analysis text:', err);
      return NextResponse.json(
        {
          error: 'Failed to extract analysis',
          details: 'Could not extract analysis text from AI response'
        },
        { status: 500 }
      );
    }
    
    if (!fullAnalysisText || !fullAnalysisText.trim()) {
      return NextResponse.json(
        {
          error: 'Failed to generate analysis',
          details: 'AI response was empty'
        },
        { status: 500 }
      );
    }

    console.log('\n=== ANÁLISIS CON GEMINI COMPLETADO ===');
    console.log('Insights length:', fullAnalysisText.length);

    // Extract audience estimation and 3 insights from the text
    let estimatedAudience = '';
    const audienceMatch = fullAnalysisText.match(/AUDIENCE:\s*([^\n\r]+)/i);
    if (audienceMatch && audienceMatch[1]) {
      estimatedAudience = audienceMatch[1].trim();
      console.log('Estimated audience:', estimatedAudience);
    }

    const insightsArray: string[] = [];
    const insightRegex = /INSIGHT\s+(\d+):\s*([\s\S]*?)(?=---|INSIGHT\s+\d+:|$)/gi;
    let match;
    
    while ((match = insightRegex.exec(fullAnalysisText)) !== null) {
      const insightNumber = parseInt(match[1]);
      const insightContent = match[2].trim();
      if (insightContent) {
        insightsArray[insightNumber - 1] = insightContent;
      }
    }

    // Fallback: try to split by "---" or numbered sections
    if (insightsArray.length === 0) {
      const sections = fullAnalysisText.split(/---|INSIGHT\s+\d+:/i);
      sections.forEach((section, index) => {
        const cleaned = section.trim();
        if (cleaned && index > 0) { // Skip first section (usually intro)
          insightsArray.push(cleaned);
        }
      });
    }

    // If still no insights, use the full text as one insight
    if (insightsArray.length === 0) {
      console.warn('No se pudieron extraer insights específicos, usando texto completo');
      insightsArray.push(fullAnalysisText.trim());
    }

    // Format the final response with insights from Gemini only
    const finalInsights = {
      originalAnalysis: fullAnalysisText.trim(),
      estimatedAudience: estimatedAudience || 'Not specified',
      insights: insightsArray.slice(0, 3).map((insight, index) => ({
        number: index + 1,
        insight: insight
      }))
    };

    console.log('\n=== COSTO TOTAL DEL PROCESO ===');
    console.log(`Gemini: $${geminiCost.toFixed(6)}`);
    console.log(`TOTAL: $${geminiCost.toFixed(6)}`);

    console.log('\n=== PROCESO COMPLETADO ===');
    console.log(`Total insights generados: ${finalInsights.insights.length}`);

    // Credit already consumed in verifyAndConsumeCredit

    // Return the results
    return NextResponse.json({
      success: true,
      contentType,
      insights: finalInsights.originalAnalysis,
      estimatedAudience: finalInsights.estimatedAudience,
      verifiedInsights: finalInsights.insights
    });

  } catch (error: any) {
    console.error('Error al analizar el contenido:', error);
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
          error: 'Error getting content data',
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