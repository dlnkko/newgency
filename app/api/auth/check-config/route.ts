import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint de ayuda para verificar la configuración de OAuth
 * Muestra el redirect_uri que se está usando para que puedas registrarlo en Whop
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const whopAppId = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
  const whopProductId = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';

  return NextResponse.json({
    message: 'Configuración de OAuth de Whop',
    instructions: [
      '1. Ve a https://dev.whop.com/ y selecciona tu aplicación',
      '2. En la configuración de OAuth, agrega el siguiente Redirect URI:',
      `   ${redirectUri}`,
      '3. Asegúrate de que coincida EXACTAMENTE (incluyendo https:// y sin barra final)',
      '4. Guarda los cambios en Whop',
      '5. Intenta hacer login de nuevo'
    ],
    currentConfig: {
      origin: origin,
      redirectUri: redirectUri,
      whopAppId: whopAppId,
      whopProductId: whopProductId,
      oauthUrl: `https://whop.com/oauth?client_id=${whopAppId}&redirect_uri=${encodeURIComponent(redirectUri)}`
    },
    importantNotes: [
      'El redirect_uri debe coincidir EXACTAMENTE con el registrado en Whop',
      'No incluyas una barra final (/) al final del URI',
      'Asegúrate de usar https:// en producción (no http://)',
      'Si estás en desarrollo local, también necesitas registrar: http://localhost:3000/api/auth/callback'
    ]
  });
}

