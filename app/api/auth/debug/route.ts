import { NextRequest, NextResponse } from 'next/server';
import { checkUserAccess } from '@/lib/whop-sdk';

const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';

export async function GET(request: NextRequest) {
  const whopUserId = request.cookies.get('whop_user_id')?.value;
  const sessionToken = request.cookies.get('whop_session_token')?.value;
  const whopApiKey = process.env.WHOP_API_KEY;

  if (!whopUserId) {
    return NextResponse.json({
      message: 'No estás autenticado. Por favor, inicia sesión primero.',
      instructions: 'Visita la página principal para ser redirigido a Whop OAuth'
    });
  }

  // Verificar acceso usando el SDK de Whop
  let accessInfo = null;
  if (whopApiKey) {
    try {
      const accessCheck = await checkUserAccess(whopUserId, WHOP_PRODUCT_ID);
      accessInfo = {
        has_access: accessCheck.hasAccess,
        access_level: accessCheck.accessLevel,
        isCustomer: accessCheck.accessLevel === 'customer',
        isAdmin: accessCheck.isAdmin,
      };
    } catch (error: any) {
      accessInfo = {
        error: error.message || 'Error verificando acceso',
      };
    }
  }

  return NextResponse.json({
    message: 'Información de autenticación',
    userId: whopUserId,
    hasSession: !!sessionToken,
    productId: WHOP_PRODUCT_ID,
    accessInfo: accessInfo || { message: 'WHOP_API_KEY no configurada' },
    instructions: accessInfo?.has_access
      ? `✅ Tienes acceso como ${accessInfo.access_level}. Deberías poder usar el software.`
      : accessInfo?.isAdmin
      ? '✅ Eres administrador. Tienes acceso completo.'
      : '❌ No tienes acceso. Necesitas comprar una membresía para usar el software.',
    note: 'Esta información se verifica automáticamente usando el SDK oficial de Whop'
  });
}

