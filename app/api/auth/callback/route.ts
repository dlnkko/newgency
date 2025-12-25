import { NextRequest, NextResponse } from 'next/server';
import { verifyWhopMembership } from '@/lib/whop-membership';

// NOTA: La App de Whop NO necesita publicarse
// Solo se usa para obtener credenciales OAuth (Client ID y Client Secret)
// El Product ID es de tu comunidad/producto real que quieres proteger

const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID || process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';
const WHOP_API_KEY = process.env.WHOP_API_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Si hay un error en el callback de OAuth
    if (error) {
      console.error('Error en callback de OAuth:', error);
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
    }

    // Si no hay código de autorización
    if (!code) {
      console.error('No se recibió código de autorización');
      // Redirigir al dashboard
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

    console.log('=== OAUTH2 V2 TOKEN EXCHANGE ===');
    console.log('Redirect URI:', redirectUri);
    console.log('Client ID:', WHOP_CLIENT_ID);
    console.log('Has Client Secret:', !!WHOP_CLIENT_SECRET);
    
    // Validar que el Client ID tenga el formato correcto
    if (WHOP_CLIENT_ID && !WHOP_CLIENT_ID.startsWith('app_')) {
      console.error('❌ ERROR: WHOP_CLIENT_ID debe empezar con "app_"');
      console.error('❌ Valor actual:', WHOP_CLIENT_ID);
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Intercambiar código por access_token usando OAuth2 v2
    // Intentar múltiples endpoints y formatos según la documentación de Whop
    let tokenResponse: Response | null = null;
    let lastError: string | null = null;

    // Formato 1: application/x-www-form-urlencoded (estándar OAuth2) - API v2
    try {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', code);
      formData.append('client_id', WHOP_CLIENT_ID);
      formData.append('client_secret', WHOP_CLIENT_SECRET);
      formData.append('redirect_uri', redirectUri);

      console.log('Intentando OAuth2 v2: application/x-www-form-urlencoded');
      tokenResponse = await fetch('https://api.whop.com/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (tokenResponse.ok) {
        console.log('✅ Token exchange exitoso con OAuth2 v2');
      } else {
        const errorText = await tokenResponse.text();
        console.log('❌ OAuth2 v2 falló:', tokenResponse.status, errorText);
        lastError = errorText;
        tokenResponse = null;
      }
    } catch (error: any) {
      console.log('❌ Error en OAuth2 v2:', error.message);
      lastError = error.message;
    }

    // Formato 2: Intentar con data.whop.com/api/v5/oauth/token (fallback)
    if (!tokenResponse || !tokenResponse.ok) {
      try {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'authorization_code');
        formData.append('code', code);
        formData.append('client_id', WHOP_CLIENT_ID);
        formData.append('client_secret', WHOP_CLIENT_SECRET);
        formData.append('redirect_uri', redirectUri);

        console.log('Intentando fallback: data.whop.com/api/v5/oauth/token');
        tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (tokenResponse.ok) {
          console.log('✅ Token exchange exitoso con fallback');
        } else {
          const errorText = await tokenResponse.text();
          console.log('❌ Fallback falló:', tokenResponse.status, errorText);
          lastError = errorText;
          tokenResponse = null;
        }
      } catch (error: any) {
        console.log('❌ Error en fallback:', error.message);
        lastError = error.message;
      }
    }

    if (!tokenResponse || !tokenResponse.ok) {
      const errorText = lastError || (tokenResponse ? await tokenResponse.text() : 'No se pudo conectar con la API de Whop');
      console.error('❌ Error exchanging code for token:', tokenResponse?.status || 'NO_RESPONSE', errorText);
      console.error('=== INFORMACIÓN DE DEBUG ===');
      console.error('Redirect URI usado:', redirectUri);
      console.error('Redirect URI debe coincidir EXACTAMENTE en Whop');
      console.error('Client ID usado:', WHOP_CLIENT_ID);
      console.error('Client ID longitud:', WHOP_CLIENT_ID?.length || 0);
      console.error('Client Secret existe:', !!WHOP_CLIENT_SECRET);
      console.error('Client Secret longitud:', WHOP_CLIENT_SECRET?.length || 0);
      console.error('Origin:', origin);
      
      // Mensaje de error más descriptivo
      let errorCode = 'auth_failed';
      if (errorText.includes('invalid_client')) {
        errorCode = 'invalid_client';
      } else if (errorText.includes('redirect_uri') || errorText.includes('redirect')) {
        errorCode = 'redirect_uri_mismatch';
      }
      
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL(`/?error=${errorCode}`, request.url));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const userId = tokenData.user_id || tokenData.user?.id;

    if (!accessToken) {
      console.error('No se recibió access_token en la respuesta');
      return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
    }

    // Verificar membresía activa usando /api/v2/me
    console.log('=== VERIFICACIÓN DE MEMBRESÍA CON /api/v2/me ===');
    console.log('Product ID:', WHOP_PRODUCT_ID);
    
    let membershipCheck;
    let finalUserId = userId;
    
    try {
      membershipCheck = await verifyWhopMembership(accessToken, WHOP_PRODUCT_ID, WHOP_API_KEY);

      if (!membershipCheck.hasAccess) {
        console.log('❌ Usuario no tiene membresía activa');
        console.log('Error:', membershipCheck.error);
        
        // Redirigir a página de error/venta
        return NextResponse.redirect(new URL(`/no-access?error=${encodeURIComponent(membershipCheck.error || 'no_access')}`, request.url));
      }

      if (membershipCheck.isAdmin) {
        console.log('✅ Usuario es ADMIN, permitiendo acceso');
      } else {
        console.log('✅ Usuario tiene membresía activa');
        console.log('Membresía ID:', membershipCheck.membership?.id);
        console.log('Status:', membershipCheck.membership?.status);
      }
      
      // Usar user_id de la respuesta de /api/v2/me si no está en tokenData
      if (membershipCheck.user?.id && !finalUserId) {
        finalUserId = membershipCheck.user.id;
      }
    } catch (error: any) {
      console.error('Error verificando membresía:', error);
      return NextResponse.redirect(new URL('/?error=access_check_failed', request.url));
    }
    
    if (!finalUserId) {
      console.error('No se pudo obtener user_id');
      return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
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

    response.cookies.set('whop_user_id', finalUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error en callback de autenticación:', error);
    // Redirigir al dashboard con mensaje de error
    return NextResponse.redirect(new URL('/?error=authentication_failed', request.url));
  }
}

