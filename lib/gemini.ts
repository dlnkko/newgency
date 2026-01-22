import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getUserGeminiApiKey } from '@/lib/auth';

/**
 * Obtiene un cliente de GoogleGenAI usando la API key del usuario autenticado
 * Si el usuario no tiene API key configurada, usa la variable de entorno como fallback
 */
export async function getGoogleGenAI(request?: NextRequest): Promise<GoogleGenAI> {
  let apiKey: string | null = null;

  // Si hay un request, intentar obtener la API key del usuario autenticado
  if (request) {
    try {
      apiKey = await getUserGeminiApiKey(request);
    } catch (error) {
      console.error('Error getting user Gemini API key:', error);
      // Continuar con fallback a variable de entorno
    }
  }

  // Si no se obtuvo la API key del usuario, usar la variable de entorno como fallback
  if (!apiKey) {
    apiKey = process.env.GOOGLE_GENAI_API_KEY || null;
  }

  if (!apiKey) {
    throw new Error(
      request 
        ? 'GOOGLE_GENAI_API_KEY is not set. Please configure your Gemini API key in your account settings or set it as an environment variable.'
        : 'GOOGLE_GENAI_API_KEY is not set in environment variables.'
    );
  }

  return new GoogleGenAI({ 
    apiKey: apiKey 
  });
}


