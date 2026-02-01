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
 * Obtiene el balance de créditos del usuario
 */
export async function getUserCredits(request: NextRequest): Promise<{
  credits: number;
  userId: string | null;
} | null> {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return null;
    }

    const supabase = getSupabaseClient();
    
    // Buscar el perfil del usuario por email
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, credits')
      .eq('email', user.email)
      .single();

    if (error || !profile) {
      // Si no existe el perfil, crear uno con 0 créditos
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          email: user.email,
          credits: 0
        })
        .select('id, credits')
        .single();

      if (createError || !newProfile) {
        console.error('Error creating profile:', createError);
        return { credits: 0, userId: null };
      }

      return {
        credits: newProfile.credits || 0,
        userId: newProfile.id
      };
    }

    return {
      credits: profile.credits || 0,
      userId: profile.id
    };
  } catch (error) {
    console.error('Error getting user credits:', error);
    return null;
  }
}

/**
 * Consume un crédito del usuario usando la función RPC
 * Retorna true si se consumió exitosamente, false si no hay créditos
 */
export async function consumeCredit(request: NextRequest): Promise<{
  success: boolean;
  remainingCredits: number;
  error?: string;
}> {
  try {
    const creditsInfo = await getUserCredits(request);
    
    if (!creditsInfo || !creditsInfo.userId) {
      return {
        success: false,
        remainingCredits: 0,
        error: 'Usuario no autenticado o perfil no encontrado'
      };
    }

    const supabase = getSupabaseClient();
    
    // Llamar a la función RPC para consumir crédito de forma atómica
    const { data: success, error } = await supabase.rpc('consume_credit', {
      user_id: creditsInfo.userId
    });

    if (error) {
      console.error('Error consuming credit:', error);
      return {
        success: false,
        remainingCredits: creditsInfo.credits,
        error: 'Error al consumir crédito'
      };
    }

    if (!success) {
      // No hay créditos disponibles
      return {
        success: false,
        remainingCredits: creditsInfo.credits,
        error: 'No hay créditos disponibles'
      };
    }

    // Obtener el nuevo balance
    const updatedCredits = await getUserCredits(request);
    const remainingCredits = updatedCredits?.credits || 0;

    return {
      success: true,
      remainingCredits
    };
  } catch (error: any) {
    console.error('Error consuming credit:', error);
    return {
      success: false,
      remainingCredits: 0,
      error: error.message || 'Error al consumir crédito'
    };
  }
}





