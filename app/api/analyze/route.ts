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
    const ai = getGoogleGenAI();
    const body = await request.json();
    const { url, type, productService, productImage } = body;

    if (!url || !type) {
      return NextResponse.json(
        { error: 'URL y tipo de análisis son requeridos' },
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
        { error: 'No se pudo extraer el ID del anuncio de la URL. Asegúrate de que la URL tenga el formato correcto: https://www.facebook.com/ads/library/?id=XXXXX' },
        { status: 400 }
      );
    }

    // Llamar a la API de scrapecreators con el ID y get_transcript: true
    const { data } = await axios.get(
      `https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${adId}`,
      {
        headers: {
          'x-api-key': 'cY3EyKqcFZf3pbfPFuvZ9t0LmDJ2',
          'get_transcript': 'true'
        }
      }
    );

    // Buscar la URL del video en múltiples estructuras posibles
    let videoUrl: string | null = null;
    
    // 1. Buscar en snapshot.videos (estructura estándar)
    if (data?.snapshot?.videos && Array.isArray(data.snapshot.videos) && data.snapshot.videos.length > 0) {
      videoUrl = data.snapshot.videos[0]?.video_sd_url || data.snapshot.videos[0]?.video_hd_url || null;
    }
    
    // 2. Buscar en snapshot.cards (estructura DCO - Dynamic Creative Optimization)
    if (!videoUrl && data?.snapshot?.cards && Array.isArray(data.snapshot.cards)) {
      for (const card of data.snapshot.cards) {
        if (card.video_sd_url || card.video_hd_url) {
          videoUrl = card.video_sd_url || card.video_hd_url || null;
          break;
        }
      }
    }
    
    // 3. Otras ubicaciones posibles
    if (!videoUrl) {
      videoUrl = 
        data?.video_sd_url || 
        data?.video_sd_urls?.[0] ||
        data?.video?.sd_url || 
        data?.video?.video_sd_url ||
        data?.video_url ||
        data?.videoUrl ||
        data?.media?.video?.url ||
        data?.media?.video_sd_url ||
        data?.ad_snapshot?.video_sd_url ||
        (data?.video && typeof data.video === 'string' ? data.video : null) ||
        (data?.videos && Array.isArray(data.videos) && data.videos[0]?.url ? data.videos[0].url : null);
    }
    
    console.log('URL del video encontrada:', videoUrl);
    console.log('Estructura disponible:', {
      hasVideos: !!data?.snapshot?.videos,
      videosLength: data?.snapshot?.videos?.length || 0,
      hasCards: !!data?.snapshot?.cards,
      cardsLength: data?.snapshot?.cards?.length || 0
    });
    
    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        adId,
        type,
        data,
        message: 'No se encontró URL de video para analizar. El anuncio puede no tener video o la estructura de la respuesta es diferente.',
        geminiAnalysis: null
      });
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
          error: 'La URL del video no es válida',
          details: 'No se pudo parsear la URL del video correctamente'
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
            error: 'El video descargado está vacío',
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
      return NextResponse.json(
        { 
          error: 'Error al procesar el video',
          details: videoError.message || 'No se pudo descargar o subir el video. El video puede ser muy grande o la URL no es accesible.'
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
              error: 'Timeout esperando que el archivo esté listo',
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
        analysisPrompt = `You are an expert AI video generator prompter, analyze the visual aspects of this video and provide a detailed prompt to get the exact same video, make sure to include the actions, the lighting, the hyper-realism, the scenes, cuts, everything that comes into place include it. 

**CRITICAL ANALYSIS REQUIREMENTS:**

1. **Audio/Text Structure Detection:**
   - Determine if the video has VOICEOVER (narration/spoken content) OR only TEXT OVERLAY (text on screen, no spoken words)
   - If there's voiceover: specify "HAS_VOICEOVER: yes" and describe the narration style
   - If there's only text overlay (no voiceover): specify "HAS_VOICEOVER: no" and indicate "TEXT_OVERLAY_ONLY: yes"

2. **Text Overlay Analysis (if present):**
   - Specify exactly what text appears in the overlay (quote the exact words/phrases)
   - Describe the TEXT DESIGN: font style, size, weight (bold, regular, etc.)
   - Describe the TEXT COLORS: exact colors used, gradients, effects
   - Describe the TEXT GRAPHICS: animations, transitions, effects, shadows, outlines
   - Describe the TEXT PLACEMENT: position on screen, timing, appearance/disappearance
   - Describe the TEXT STYLE: modern, bold, minimalist, decorative, etc.

The output must be only the detailed prompt optimized for AI video generation in one paragraph.`;
        break;
      default:
        analysisPrompt = 'Analiza este video de anuncio publicitario en detalle.';
    }

    // Analizar el video con Gemini
    console.log('Analizando video con Gemini...');
    let result;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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
          error: 'Error al analizar el video con Gemini',
          details: geminiError.message || 'No se pudo procesar el video con la IA',
          geminiError: geminiError.response?.data || geminiError.message
        },
        { status: 500 }
      );
    }

    // Obtener el texto de la respuesta
    let analysisText = 'No se pudo obtener el análisis';
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
    if (!analysisText || analysisText === 'No se pudo obtener el análisis' || analysisText.trim().length === 0) {
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

        // Precios de Gemini 3 Pro Preview (por millón de tokens)
        // Input: $2 por millón (hasta 200k tokens)
        // Output: $12 por millón (hasta 200k tokens)
        const inputCostPerMillion = 2.0;
        const outputCostPerMillion = 12.0;

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
                             analysisText !== 'No se pudo obtener el análisis' && 
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
            const productMime = productImage.split(';')[0].split(':')[1] || 'image/png';
            
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
        
        const adaptationPrompt = `You are an expert AI video generator prompt engineer. You have been given:

1. A detailed production prompt that was reverse-engineered from a successful ad video
2. A user's product/service: "${productService}"
${productImageFile ? '3. An image of the user\'s product/service (analyze this image carefully to understand the exact product appearance, colors, materials, textures, and characteristics)' : ''}

**Original Production Prompt:**
${analysisText}

**User's Product/Service Description:**
"${productService}"

**Your Task:**
Transform the original production prompt into an equally detailed video prompt, but now adapted for the user's product/service described above.
${productImageFile ? 'Use the provided product image as a reference to ensure the adapted prompt accurately describes the product\'s appearance, colors, materials, textures, and visual characteristics. The prompt must be faithful to what is shown in the image.' : ''}

**CRITICAL REQUIREMENTS:**

1. **Scene Coherence with Product Description:**
   - Analyze the user's product/service description: "${productService}"
   - Create scenes that are COHERENT with what the product/service does and its purpose
   - Adapt ALL scenes from the original video to show the user's product/service in action
   - The actions and what happens in each scene must make sense with the product/service description
   - If the user describes "earplugs that lets you control the noises in the street", create scenes showing someone using earplugs, controlling street noise, experiencing the benefit
   - If the user describes a service or product with specific features, show those features in action through the scenes
   - Make sure every scene tells part of the story of how the product/service works or its benefits, based on the description provided

2. **Audio/Text Structure - MUST MATCH ORIGINAL:**
   - FIRST, analyze the original prompt to determine if it has VOICEOVER or only TEXT OVERLAY
   - If the original has "HAS_VOICEOVER: no" or "TEXT_OVERLAY_ONLY: yes", then your adapted prompt MUST also have ONLY TEXT OVERLAY (NO voiceover, NO narration, NO spoken words)
   - If the original has voiceover, you may include voiceover but adapt it to "${productService}"
   - **CRITICAL**: If original is TEXT OVERLAY ONLY, the adapted version MUST be TEXT OVERLAY ONLY - do NOT add voiceover

3. **Text Overlay (if original has text overlay):**
   - Adapt the text content to be relevant to "${productService}", but maintain the SAME TEXT DESIGN (font style, size, weight)
   - Maintain the SAME TEXT COLORS (exact colors, gradients, effects from original)
   - Maintain the SAME TEXT GRAPHICS (animations, transitions, effects, shadows, outlines from original)
   - Maintain the SAME TEXT PLACEMENT (position on screen, timing, appearance/disappearance)
   - Maintain the SAME TEXT STYLE (modern, bold, minimalist, decorative, etc.)
   - Adapt ONLY the actual words/phrases to be relevant to "${productService}", but keep everything else (graphics, colors, design) EXACTLY as described in the original

4. **Action and Scene Adaptation:**
   - Transform ALL actions, product references, and visual elements to be relevant to "${productService}"
   - Adapt scenes to show the product/service being used or demonstrated based on the description
   - If the original shows someone using a product, show someone using "${productService}" in a way that demonstrates what it does (based on the description)
   - Make sure actions in scenes are logical and coherent with the product/service description
   - Each scene should contribute to showing how the product/service works, what problem it solves, or what benefit it provides (based on the description)
${productImageFile ? '- Accurately describe the product from the image: exact colors, materials, textures, shape, size, branding, and visual details' : ''}
   - Maintain the same visual style, pacing, and cinematography from the original
   - Keep all technical details (lighting, camera angles, cuts, transitions, etc.) exactly the same
   - Keep the same emotional tone and mood
   - Maintain the EXACT same level of detail as the original prompt

4. **Output Format:**
   - The output must be a single, detailed paragraph optimized for AI video generation
   - No line breaks, no additional explanations or formatting

**Output:**
Provide ONLY the adapted production prompt as a single continuous paragraph, without line breaks, without additional explanations or formatting.`;

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
          model: 'gemini-3-pro-preview',
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

        if (adaptationText) {
          adaptedPrompt = adaptationText.trim();
          console.log('Adapted prompt generated successfully');
          
          // Calculate costs for adaptation (server-side only)
          try {
            const adaptationUsageMetadata = (adaptationResult as any).usageMetadata;
            if (adaptationUsageMetadata) {
              const adaptPromptTokens = adaptationUsageMetadata.promptTokenCount || 0;
              const adaptCandidatesTokens = adaptationUsageMetadata.candidatesTokenCount || 0;
              const adaptTotalTokens = adaptationUsageMetadata.totalTokenCount || (adaptPromptTokens + adaptCandidatesTokens);

              const inputCostPerMillion = 2.0;
              const outputCostPerMillion = 12.0;

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
        }
      } catch (adaptationError: any) {
        console.error('Error generating adapted prompt:', adaptationError);
        // Don't fail the whole request if adaptation fails, just log it
      }
    } else if (type === 'production' && productService && productService.trim() && !hasValidAnalysis) {
      console.warn('Cannot generate adapted prompt: original analysis was not obtained successfully');
      console.warn('Analysis text:', analysisText);
    }
    
    console.log('Análisis completado');

    return NextResponse.json({
      success: true,
      adId,
      type,
      data,
      geminiAnalysis: {
        text: analysisText,
        fileUri: myfile.uri
      },
      adaptedPrompt: adaptedPrompt || null,
      usage: usageInfo
    });

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
          error: 'Error al obtener datos del anuncio',
          details: errorData 
            ? (typeof errorData === 'string' ? errorData : JSON.stringify(errorData))
            : errorMessage,
          statusCode: status
        },
        { status }
      );
    }

    // Error de Gemini u otro error
    const errorMessage = error.message || 'Error desconocido';
    console.error('Error general:', errorMessage);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

