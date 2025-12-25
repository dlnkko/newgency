/**
 * Helper function to check if a user has access to a Whop resource
 * Uses the official Whop API checkAccess endpoint
 * @see https://docs.whop.com/api-reference/users/check-access
 */

export interface WhopAccessCheck {
  has_access: boolean;
  access_level: 'no_access' | 'admin' | 'customer';
}

/**
 * Check if a user has access to a Whop resource (product, company, or experience)
 * @param userId - The Whop user ID (user_xxx) or username
 * @param resourceId - The resource ID (prod_xxx for product, biz_xxx for company, exp_xxx for experience)
 * @param apiKey - The Whop API key
 * @returns Access check result with has_access and access_level
 */
export async function checkWhopAccess(
  userId: string,
  resourceId: string,
  apiKey: string
): Promise<WhopAccessCheck> {
  if (!apiKey) {
    throw new Error('WHOP_API_KEY no está configurada');
  }

  if (!userId) {
    throw new Error('User ID es requerido');
  }

  if (!resourceId) {
    throw new Error('Resource ID (Product ID) es requerido');
  }

  // Según la documentación de Whop: GET /users/{id}/access/{resource_id}
  // Intentar con data.whop.com/api/v5/ primero (consistente con OAuth token endpoint)
  // Si falla, intentar con api.whop.com/api/v2/
  const urls = [
    `https://data.whop.com/api/v5/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`,
    `https://api.whop.com/api/v2/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`,
  ];

  // Intentar con Bearer primero, luego sin Bearer si falla con 401
  const authFormats = [
    `Bearer ${apiKey}`,
    apiKey,
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    for (const authHeader of authFormats) {
      try {
        console.log('=== CHECK ACCESS REQUEST ===');
        console.log('URL:', url);
        console.log('User ID:', userId);
        console.log('Resource ID:', resourceId);
        console.log('Auth format:', authHeader.startsWith('Bearer') ? 'Bearer' : 'Direct');
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error checking Whop access (${response.status}):`, errorText);
          
          // Si es 401, intentar otro formato de auth
          if (response.status === 401) {
            lastError = new Error(`Autenticación fallida (401). Verifica que WHOP_API_KEY sea correcta.`);
            continue; // Intentar siguiente formato
          }

          // Si es 404, el usuario o recurso no existe
          if (response.status === 404) {
            throw new Error(`Usuario o recurso no encontrado (404). Verifica que el User ID (${userId}) y Product ID (${resourceId}) sean correctos.`);
          }

          // Para otros errores, intentar parsear el mensaje
          let errorMessage = `Whop API error: ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
          
          lastError = new Error(errorMessage);
          continue; // Intentar siguiente URL/formato
        }

        const data: WhopAccessCheck = await response.json();
        console.log('✅ Check access response:', data);
        return data;
      } catch (error: any) {
        // Si es un error de red, no continuar con otros formatos
        if (error.message && !error.message.includes('401') && !error.message.includes('404')) {
          console.error('❌ Network error:', error);
          throw error;
        }
        lastError = error;
        continue;
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  if (lastError) {
    throw lastError;
  }
  
  throw new Error('Error verificando acceso: No se pudo conectar con la API de Whop');
}

