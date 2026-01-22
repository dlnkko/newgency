import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Obtiene el usuario autenticado desde las cookies de la sesión
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<{ email: string } | null> {
  try {
    const sessionCookie = request.cookies.get('app_session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const sessionData = JSON.parse(sessionCookie.value);
    
    if (!sessionData.email || !sessionData.verified) {
      return null;
    }

    return {
      email: sessionData.email.toLowerCase().trim()
    };
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

/**
 * Obtiene un cliente de Supabase con permisos de servicio para operaciones en la base de datos
 */
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

/**
 * Obtiene la API key de Gemini del usuario desde Supabase
 */
export async function getUserGeminiApiKey(request: NextRequest): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return null;
    }

    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('whop_users')
      .select('gemini_api_key')
      .eq('email', user.email)
      .single();

    if (error || !data || !data.gemini_api_key) {
      return null;
    }

    return data.gemini_api_key;
  } catch (error) {
    console.error('Error getting user Gemini API key:', error);
    return null;
  }
}

/**
 * Guarda o actualiza la API key de Gemini del usuario en Supabase
 */
export async function saveUserGeminiApiKey(request: NextRequest, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Validar que la API key no esté vacía
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'La API key no puede estar vacía' };
    }

    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('whop_users')
      .update({ gemini_api_key: apiKey.trim() })
      .eq('email', user.email);

    if (error) {
      console.error('Error saving Gemini API key:', error);
      return { success: false, error: 'Error al guardar la API key' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving user Gemini API key:', error);
    return { success: false, error: error.message || 'Error al guardar la API key' };
  }
}

