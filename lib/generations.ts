import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from './auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

/**
 * Obtiene el estado de generaciones del usuario
 */
export async function getUserGenerations(request: NextRequest): Promise<{
  used: number;
  limit: number;
  remaining: number;
} | null> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return null;
    }

    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('whop_users')
      .select('generations_used, generations_limit')
      .eq('email', user.email)
      .single();

    if (error || !data) {
      // Si no existe, inicializar con valores por defecto
      return {
        used: 0,
        limit: 500,
        remaining: 500
      };
    }

    const used = data.generations_used || 0;
    const limit = data.generations_limit || 500;
    const remaining = Math.max(0, limit - used);

    return {
      used,
      limit,
      remaining
    };
  } catch (error) {
    console.error('Error getting user generations:', error);
    return null;
  }
}

/**
 * Verifica si el usuario tiene generaciones disponibles
 */
export async function checkUserGenerations(request: NextRequest): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}> {
  const generations = await getUserGenerations(request);
  
  if (!generations) {
    return {
      allowed: false,
      remaining: 0,
      limit: 500,
      used: 0
    };
  }

  return {
    allowed: generations.remaining > 0,
    remaining: generations.remaining,
    limit: generations.limit,
    used: generations.used
  };
}

/**
 * Incrementa el contador de generaciones del usuario
 */
export async function incrementUserGenerations(request: NextRequest): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const supabase = getSupabaseClient();
    
    // Primero obtener el valor actual
    const { data: currentData, error: fetchError } = await supabase
      .from('whop_users')
      .select('generations_used')
      .eq('email', user.email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user generations:', fetchError);
      return { success: false, error: 'Error al obtener generaciones del usuario' };
    }

    const currentUsed = currentData?.generations_used || 0;
    const newUsed = currentUsed + 1;

    // Actualizar el contador
    const { error: updateError } = await supabase
      .from('whop_users')
      .update({ generations_used: newUsed })
      .eq('email', user.email);

    if (updateError) {
      console.error('Error incrementing user generations:', updateError);
      return { success: false, error: 'Error al actualizar generaciones' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error incrementing user generations:', error);
    return { success: false, error: error.message || 'Error al incrementar generaciones' };
  }
}

/**
 * Agrega generaciones al usuario (después de compra)
 */
export async function addUserGenerations(request: NextRequest, amount: number): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const supabase = getSupabaseClient();
    
    // Obtener valores actuales
    const { data: currentData, error: fetchError } = await supabase
      .from('whop_users')
      .select('generations_limit')
      .eq('email', user.email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching user generations:', fetchError);
      return { success: false, error: 'Error al obtener generaciones del usuario' };
    }

    const currentLimit = currentData?.generations_limit || 500;
    const newLimit = currentLimit + amount;

    // Actualizar el límite
    const { error: updateError } = await supabase
      .from('whop_users')
      .update({ generations_limit: newLimit })
      .eq('email', user.email);

    if (updateError) {
      console.error('Error adding user generations:', updateError);
      return { success: false, error: 'Error al agregar generaciones' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error adding user generations:', error);
    return { success: false, error: error.message || 'Error al agregar generaciones' };
  }
}






