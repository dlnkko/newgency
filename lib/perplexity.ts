import axios from 'axios';

/**
 * Helper function to get and validate Perplexity API key at runtime
 */
function getPerplexityApiKey(): string {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  // Debug logging
  console.log('=== VERIFICACIÓN PERPLEXITY API KEY ===');
  console.log('PERPLEXITY_API_KEY existe?', !!apiKey);
  console.log('PERPLEXITY_API_KEY primeros 10 chars:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NO DEFINIDA');
  console.log('PERPLEXITY_API_KEY longitud:', apiKey?.length || 0);
  console.log('Variables de entorno disponibles:', Object.keys(process.env).filter(key => key.includes('PERPLEXITY') || key.includes('API')).join(', ') || 'ninguna');
  
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file. Make sure to restart your Next.js server after adding the variable.');
  }
  
  return apiKey;
}

/**
 * Modelos disponibles de Perplexity
 */
export type PerplexityModel = 
  | 'sonar-pro'           // Sonar Pro - Modelo avanzado para tareas complejas
  | 'sonar'               // Sonar - Modelo estándar
  | 'sonar-pro-online'    // Sonar Pro Online - Con búsqueda en tiempo real
  | 'sonar-online';       // Sonar Online - Con búsqueda en tiempo real

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityOptions {
  model?: PerplexityModel;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  return_citations?: boolean;
  return_related_questions?: boolean;
  return_images?: boolean;
  return_raw_citations?: boolean;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
  related_questions?: string[];
  images?: string[];
  raw_citations?: any[];
}

/**
 * Realiza una solicitud al modelo Sonar Pro de Perplexity
 * 
 * @param messages - Array de mensajes en formato conversacional
 * @param options - Opciones adicionales para la solicitud
 * @returns Respuesta de Perplexity con el contenido generado
 */
export async function callPerplexitySonarPro(
  messages: PerplexityMessage[],
  options: PerplexityOptions = {}
): Promise<PerplexityResponse> {
  const apiKey = getPerplexityApiKey();
  
  const {
    model = 'sonar-pro',
    temperature = 0.2,
    max_tokens = 4096,
    top_p = 0.9,
    stream = false,
    return_citations = true,
    return_related_questions = false,
    return_images = false,
    return_raw_citations = false,
  } = options;

  try {
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream,
        return_citations,
        return_related_questions,
        return_images,
        return_raw_citations,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `Perplexity API error: ${error.response.status} - ${error.response.data?.error?.message || error.response.statusText}`
      );
    } else if (error.request) {
      throw new Error('No response received from Perplexity API');
    } else {
      throw new Error(`Error setting up Perplexity request: ${error.message}`);
    }
  }
}

/**
 * Función helper para generar contenido de texto usando Sonar Pro
 * 
 * @param prompt - El prompt del usuario
 * @param systemPrompt - Prompt del sistema (opcional)
 * @param options - Opciones adicionales
 * @returns El texto generado por Sonar Pro
 */
export async function generateTextWithSonarPro(
  prompt: string,
  systemPrompt?: string,
  options: PerplexityOptions = {}
): Promise<string> {
  const messages: PerplexityMessage[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt,
  });

  const response = await callPerplexitySonarPro(messages, options);
  
  if (response.choices && response.choices.length > 0) {
    return response.choices[0].message.content;
  }
  
  throw new Error('No response content from Perplexity');
}

/**
 * Función helper para obtener respuesta con citas (útil para investigación)
 * 
 * @param prompt - El prompt del usuario
 * @param systemPrompt - Prompt del sistema (opcional)
 * @returns Respuesta con contenido y citas
 */
export async function generateWithCitations(
  prompt: string,
  systemPrompt?: string
): Promise<{ content: string; citations: string[]; usage: any }> {
  const messages: PerplexityMessage[] = [];
  
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt,
  });

  const response = await callPerplexitySonarPro(messages, {
    return_citations: true,
    return_related_questions: true,
  });
  
  if (response.choices && response.choices.length > 0) {
    return {
      content: response.choices[0].message.content,
      citations: response.citations || [],
      usage: response.usage,
    };
  }
  
  throw new Error('No response content from Perplexity');
}

