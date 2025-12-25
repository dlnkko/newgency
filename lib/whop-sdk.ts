/**
 * Configuración del SDK de Whop
 * Usa el SDK oficial de Whop para autenticación y verificación de acceso
 */

import Whop from '@whop/sdk';

// Cliente de Whop para operaciones del servidor
export const whopClient = new Whop({
  apiKey: process.env.WHOP_API_KEY,
});

// Verificar acceso de un usuario a un recurso usando el SDK
export async function checkUserAccess(userId: string, resourceId: string) {
  try {
    console.log('=== VERIFICANDO ACCESO CON SDK ===');
    console.log('User ID:', userId);
    console.log('Resource ID:', resourceId);
    
    const response = await whopClient.users.checkAccess(resourceId, { id: userId });
    
    console.log('Access level:', response.access_level);
    console.log('Has access:', response.access_level !== 'no_access');
    
    return {
      hasAccess: response.access_level !== 'no_access',
      accessLevel: response.access_level,
      isAdmin: response.access_level === 'admin',
    };
  } catch (error: any) {
    console.error('Error verificando acceso con SDK:', error);
    return {
      hasAccess: false,
      accessLevel: 'no_access' as const,
      isAdmin: false,
      error: error.message,
    };
  }
}

// Verificar membresías activas de un usuario usando el SDK
export async function getUserMemberships(userId: string, productId: string) {
  try {
    console.log('=== OBTENIENDO MEMBRESÍAS CON SDK ===');
    console.log('User ID:', userId);
    console.log('Product ID:', productId);
    
    // Listar todas las membresías del usuario
    const memberships = [];
    for await (const membershipResponse of whopClient.memberships.list()) {
      // Acceder al product.id y user.id en lugar de product_id y user_id
      const membershipProductId = membershipResponse.product?.id;
      const membershipUserId = membershipResponse.user?.id;
      
      if (membershipUserId === userId && membershipProductId === productId) {
        memberships.push(membershipResponse);
      }
    }
    
    console.log('Membresías encontradas:', memberships.length);
    
    // Buscar membresía activa
    const activeMembership = memberships.find(
      (m) => m.status === 'active' && m.product?.id === productId
    );
    
    if (activeMembership) {
      console.log('✅ Membresía activa encontrada:', activeMembership.id);
    } else {
      console.log('❌ No se encontró membresía activa');
    }
    
    return {
      hasActiveMembership: !!activeMembership,
      membership: activeMembership || null,
      allMemberships: memberships,
    };
  } catch (error: any) {
    console.error('Error obteniendo membresías con SDK:', error);
    return {
      hasActiveMembership: false,
      membership: null,
      allMemberships: [],
      error: error.message,
    };
  }
}

