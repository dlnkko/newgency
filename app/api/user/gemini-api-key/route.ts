import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserGeminiApiKey, saveUserGeminiApiKey } from '@/lib/auth';

/**
 * GET: Obtener la API key de Gemini del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const apiKey = await getUserGeminiApiKey(request);
    
    // Retornar solo una indicación de si existe o no (por seguridad, no enviamos la key completa)
    return NextResponse.json({
      success: true,
      hasApiKey: !!apiKey,
      // Solo mostramos los primeros y últimos caracteres para confirmación
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : null
    });
  } catch (error: any) {
    console.error('Error getting Gemini API key:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener la API key' },
      { status: 500 }
    );
  }
}

/**
 * POST: Guardar o actualizar la API key de Gemini del usuario
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json(
        { error: 'La API key es requerida' },
        { status: 400 }
      );
    }

    const result = await saveUserGeminiApiKey(request, apiKey);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error al guardar la API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key guardada correctamente'
    });
  } catch (error: any) {
    console.error('Error saving Gemini API key:', error);
    return NextResponse.json(
      { error: error.message || 'Error al guardar la API key' },
      { status: 500 }
    );
  }
}







