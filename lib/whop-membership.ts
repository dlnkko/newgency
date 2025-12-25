/**
 * Funciones para validar membresías de Whop usando OAuth2 v2
 * Consulta el endpoint /api/v2/me para verificar membresías activas
 * También verifica si el usuario es admin usando checkWhopAccess
 */

import { checkWhopAccess } from './whop-access';

export interface WhopMembership {
  id: string;
  product_id: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  created_at: string;
  updated_at: string;
}

export interface WhopMeResponse {
  id: string;
  username: string;
  email: string;
  memberships?: WhopMembership[];
}

/**
 * Verifica que el usuario tenga una membresía activa para el Product ID especificado
 * También verifica si el usuario es admin del producto
 * @param accessToken - El access_token obtenido del flujo OAuth2
 * @param productId - El Product ID a verificar (ej: prod_ZfB8PwCxIaiC2)
 * @param apiKey - Opcional: WHOP_API_KEY para verificar si el usuario es admin
 * @returns Objeto con hasAccess y detalles de la membresía
 */
export async function verifyWhopMembership(
  accessToken: string,
  productId: string,
  apiKey?: string
): Promise<{
  hasAccess: boolean;
  membership?: WhopMembership;
  user?: WhopMeResponse;
  isAdmin?: boolean;
  error?: string;
}> {
  if (!accessToken) {
    return {
      hasAccess: false,
      error: 'Access token no proporcionado',
    };
  }

  if (!productId) {
    return {
      hasAccess: false,
      error: 'Product ID no proporcionado',
    };
  }

  try {
    // Consultar el endpoint /api/v2/me usando el access_token
    const response = await fetch('https://api.whop.com/api/v2/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error consultando /api/v2/me (${response.status}):`, errorText);
      
      if (response.status === 401) {
        return {
          hasAccess: false,
          error: 'Token de acceso inválido o expirado',
        };
      }

      return {
        hasAccess: false,
        error: `Error de la API de Whop: ${response.status}`,
      };
    }

    const userData: WhopMeResponse = await response.json();
    console.log('=== RESPUESTA /api/v2/me ===');
    console.log('Usuario ID:', userData.id);
    console.log('Username:', userData.username);
    console.log('Email:', userData.email);
    console.log('Membresías:', userData.memberships?.length || 0);

    // PRIMERO: Verificar si el usuario es admin (si tenemos API key)
    if (apiKey && userData.id) {
      try {
        console.log('=== VERIFICANDO SI ES ADMIN ===');
        const accessCheck = await checkWhopAccess(userData.id, productId, apiKey);
        console.log('Access level:', accessCheck.access_level);
        
        if (accessCheck.access_level === 'admin') {
          console.log('✅ Usuario es ADMIN, permitiendo acceso');
          return {
            hasAccess: true,
            user: userData,
            isAdmin: true,
          };
        }
      } catch (error: any) {
        console.log('⚠️ No se pudo verificar si es admin (continuando con verificación de membresía):', error.message);
        // Continuar con verificación de membresía si falla la verificación de admin
      }
    }

    // SEGUNDO: Verificar si el usuario tiene membresías
    if (!userData.memberships || userData.memberships.length === 0) {
      console.log('❌ Usuario no tiene membresías');
      return {
        hasAccess: false,
        user: userData,
        error: 'Usuario no tiene membresías',
      };
    }

    // Buscar una membresía activa que coincida con el Product ID
    const activeMembership = userData.memberships.find(
      (membership) =>
        membership.product_id === productId && membership.status === 'active'
    );

    if (activeMembership) {
      console.log('✅ Usuario tiene membresía activa para el producto:', productId);
      console.log('Membresía ID:', activeMembership.id);
      console.log('Status:', activeMembership.status);
      return {
        hasAccess: true,
        membership: activeMembership,
        user: userData,
      };
    }

    // Si no hay membresía activa, verificar si hay alguna membresía para este producto
    const anyMembership = userData.memberships.find(
      (membership) => membership.product_id === productId
    );

    if (anyMembership) {
      console.log('❌ Usuario tiene membresía pero no está activa');
      console.log('Status de membresía:', anyMembership.status);
      return {
        hasAccess: false,
        membership: anyMembership,
        user: userData,
        error: `Membresía existe pero está ${anyMembership.status}`,
      };
    }

    console.log('❌ Usuario no tiene membresía para el producto:', productId);
    return {
      hasAccess: false,
      user: userData,
      error: 'Usuario no tiene membresía para este producto',
    };
  } catch (error: any) {
    console.error('Error verificando membresía de Whop:', error);
    return {
      hasAccess: false,
      error: error.message || 'Error al verificar membresía',
    };
  }
}

