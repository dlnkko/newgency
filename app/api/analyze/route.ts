import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyCT8IBlR4FjOYp8t8EV-raQ_a0dxg0gtzA' });

export async function POST(request: NextRequest) {

  try {
    const body = await request.json();
    const { url, type } = body;

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

    // Descargar el video directamente a memoria (sin guardar en disco)
    console.log('Descargando video desde:', cleanVideoUrl);
    let videoBuffer: Buffer;
    try {
      const videoResponse = await axios.get(cleanVideoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 segundos de timeout
        maxRedirects: 5
      });
      
      videoBuffer = Buffer.from(videoResponse.data);
      console.log('Video descargado en memoria:', videoBuffer.length, 'bytes');
      
      if (videoBuffer.length === 0) {
        return NextResponse.json(
          { 
            error: 'El video descargado está vacío',
            details: 'El video no tiene contenido'
          },
          { status: 500 }
        );
      }
    } catch (downloadError: any) {
      console.error('Error al descargar el video:', downloadError);
      return NextResponse.json(
        { 
          error: 'Error al descargar el video',
          details: downloadError.message || 'No se pudo descargar el video desde la URL proporcionada'
        },
        { status: 500 }
      );
    }

    // Subir el video a Gemini Files directamente desde el buffer en memoria
    console.log('Subiendo video a Gemini Files desde memoria...');
    let myfile;
    try {
      // Convertir Buffer a Uint8Array para compatibilidad con Blob
      const videoUint8Array = new Uint8Array(videoBuffer);
      const videoBlob = new Blob([videoUint8Array], { type: 'video/mp4' });
      
      myfile = await ai.files.upload({
        file: videoBlob,
        config: { mimeType: 'video/mp4' }
      });
      console.log('Video subido a Gemini:', myfile.uri);
      console.log('Estado inicial del archivo:', myfile.state);
      
      // Liberar la memoria del buffer después de subirlo
      videoBuffer = null as any;
    } catch (uploadError: any) {
      console.error('Error al subir video a Gemini:', uploadError);
      // Si falla con Blob, intentar con el Buffer como stream usando Readable
      try {
        const { Readable } = await import('stream');
        const videoStream = Readable.from(videoBuffer);
        
        myfile = await ai.files.upload({
          file: videoStream as any,
          config: { mimeType: 'video/mp4' }
        });
        console.log('Video subido a Gemini (usando stream):', myfile.uri);
        console.log('Estado inicial del archivo:', myfile.state);
        videoBuffer = null as any;
      } catch (streamError: any) {
        console.error('Error al subir video con stream:', streamError);
        // Liberar memoria en caso de error
        videoBuffer = null as any;
        return NextResponse.json(
          { 
            error: 'Error al subir el video a Gemini',
            details: uploadError.message || streamError.message || 'No se pudo subir el video para análisis'
          },
          { status: 500 }
        );
      }
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
        analysisPrompt = 'You are an expert AI video generator prompter, analyze the visual aspects of this video and provide a detailed prompt to get the exact same video, make sure to include the actions, the lighting, the hyper-realism, the scenes, cuts, everything that comes into place include it and the output must be only the detailed prompt optimzed for ai video generation in one paragraph.';
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
    try {
      // La respuesta de Gemini tiene la estructura: result.candidates[0].content.parts[0].text
      if (result.candidates && result.candidates[0]?.content?.parts) {
        analysisText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');
      } else if ((result as any).text) {
        analysisText = (result as any).text;
      } else {
        console.error('Estructura inesperada de la respuesta de Gemini:', JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error('Error al extraer texto de la respuesta:', err);
      console.error('Estructura de result:', JSON.stringify(result, null, 2));
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
      usage: usageInfo,
      cost: costInfo
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

