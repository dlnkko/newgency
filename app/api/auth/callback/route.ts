import { NextRequest, NextResponse } from 'next/server';
import { whopClient, checkUserAccess } from '@/lib/whop-sdk';

const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID || process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Si hay un error en el callback de OAuth
    if (error) {
      console.error('Error en callback de OAuth:', error);
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
    }

    // Si no hay código de autorización
    if (!code) {
      console.error('No se recibió código de autorización');
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Validar credenciales OAuth2
    if (!WHOP_CLIENT_SECRET) {
      console.error('WHOP_CLIENT_SECRET no está configurada');
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Construir redirect_uri - debe coincidir EXACTAMENTE con el registrado en Whop
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/callback`;

    console.log('=== OAUTH2 TOKEN EXCHANGE ===');
    console.log('Redirect URI:', redirectUri);
    console.log('Client ID:', WHOP_CLIENT_ID);
    console.log('Client ID length:', WHOP_CLIENT_ID?.length || 0);
    console.log('Client Secret exists:', !!WHOP_CLIENT_SECRET);
    console.log('Client Secret length:', WHOP_CLIENT_SECRET?.length || 0);
    console.log('Code length:', code.length);
    
    // Validar que el Client ID tenga el formato correcto
    if (WHOP_CLIENT_ID && !WHOP_CLIENT_ID.startsWith('app_')) {
      console.error('❌ ERROR: WHOP_CLIENT_ID debe empezar con "app_"');
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Validar que el Client Secret no esté vacío
    if (!WHOP_CLIENT_SECRET || WHOP_CLIENT_SECRET.trim().length === 0) {
      console.error('❌ ERROR: WHOP_CLIENT_SECRET está vacío');
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Intercambiar código por access_token usando OAuth2
    // Intentar múltiples formatos según la documentación de Whop
    let tokenResponse: Response | null = null;
    let lastError: string | null = null;

    // Formato 1: Basic Auth + form-urlencoded (estándar OAuth2)
    try {
      const basicAuth = Buffer.from(`${WHOP_CLIENT_ID}:${WHOP_CLIENT_SECRET}`).toString('base64');
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', code);
      formData.append('redirect_uri', redirectUri);

      console.log('Intentando formato 1: Basic Auth + form-urlencoded');
      tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
        },
        body: formData.toString(),
      });

      if (tokenResponse.ok) {
        console.log('✅ Token exchange exitoso con Basic Auth');
      } else {
        const errorText = await tokenResponse.text();
        console.log('❌ Formato 1 falló:', tokenResponse.status, errorText);
        lastError = errorText;
        tokenResponse = null;
      }
    } catch (error: any) {
      console.log('❌ Error en formato 1:', error.message);
      lastError = error.message;
    }

    // Formato 2: client_id y client_secret en body (form-urlencoded)
    if (!tokenResponse || !tokenResponse.ok) {
      try {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'authorization_code');
        formData.append('code', code);
        formData.append('client_id', WHOP_CLIENT_ID);
        formData.append('client_secret', WHOP_CLIENT_SECRET);
        formData.append('redirect_uri', redirectUri);

        console.log('Intentando formato 2: client_id/client_secret en body');
        tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (tokenResponse.ok) {
          console.log('✅ Token exchange exitoso con formato 2');
        } else {
          const errorText = await tokenResponse.text();
          console.log('❌ Formato 2 falló:', tokenResponse.status, errorText);
          lastError = errorText;
          tokenResponse = null;
        }
      } catch (error: any) {
        console.log('❌ Error en formato 2:', error.message);
        lastError = error.message;
      }
    }

    if (!tokenResponse || !tokenResponse.ok) {
      const errorText = lastError || (tokenResponse ? await tokenResponse.text() : 'No se pudo conectar con la API de Whop');
      console.error('❌ Error exchanging code for token:', tokenResponse?.status || 'NO_RESPONSE', errorText);
      console.error('');
      console.error('=== INFORMACIÓN DE DEBUG ===');
      console.error('Redirect URI usado:', redirectUri);
      console.error('Client ID usado:', WHOP_CLIENT_ID);
      console.error('Client ID primeros 10 chars:', WHOP_CLIENT_ID?.substring(0, 10));
      console.error('Client Secret existe:', !!WHOP_CLIENT_SECRET);
      console.error('Client Secret primeros 10 chars:', WHOP_CLIENT_SECRET?.substring(0, 10));
      console.error('');
      console.error('⚠️ VERIFICA EN WHOP (https://dev.whop.com/ → Tu App → OAuth):');
      console.error('1. El Redirect URI debe ser EXACTAMENTE:', redirectUri);
      console.error('2. El Client ID debe ser:', WHOP_CLIENT_ID);
      console.error('3. El Client Secret debe coincidir EXACTAMENTE con el de Whop');
      console.error('4. Asegúrate de que no haya espacios al inicio o final del Client Secret');
      console.error('5. Verifica que el Client ID empiece con "app_" (no "prod_")');
      
      let errorCode = 'auth_failed';
      if (errorText.includes('invalid_client')) {
        errorCode = 'invalid_client';
      } else if (errorText.includes('redirect_uri') || errorText.includes('redirect')) {
        errorCode = 'redirect_uri_mismatch';
      }
      
      return NextResponse.redirect(new URL(`/?error=${errorCode}`, request.url));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const userId = tokenData.user_id || tokenData.user?.id;

    if (!accessToken || !userId) {
      console.error('No se recibió access_token o user_id en la respuesta');
      return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
    }

    console.log('=== VERIFICACIÓN DE ACCESO CON SDK ===');
    console.log('User ID:', userId);
    console.log('Product ID:', WHOP_PRODUCT_ID);

    // Verificar acceso usando el SDK de Whop
    try {
      const accessCheck = await checkUserAccess(userId, WHOP_PRODUCT_ID);

      if (!accessCheck.hasAccess) {
        console.log('❌ Usuario no tiene acceso');
        console.log('Access level:', accessCheck.accessLevel);
        console.log('Error:', accessCheck.error);
        
        return NextResponse.redirect(new URL(`/no-access?error=${encodeURIComponent(accessCheck.error || 'no_access')}`, request.url));
      }

      if (accessCheck.isAdmin) {
        console.log('✅ Usuario es ADMIN, permitiendo acceso');
      } else {
        console.log('✅ Usuario tiene acceso (membresía activa)');
      }
    } catch (error: any) {
      console.error('Error verificando acceso:', error);
      return NextResponse.redirect(new URL('/?error=access_check_failed', request.url));
    }

    // Usuario tiene acceso, establecer cookies de sesión
    const response = NextResponse.redirect(new URL('/', request.url));
    
    // Establecer cookies de sesión (seguras, httpOnly, sameSite)
    response.cookies.set('whop_session_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    response.cookies.set('whop_user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error en callback de autenticación:', error);
    return NextResponse.redirect(new URL('/?error=authentication_failed', request.url));
  }
}
