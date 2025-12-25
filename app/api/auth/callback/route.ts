import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkWhopAccess } from '@/lib/whop-access';

const WHOP_API_KEY = process.env.WHOP_API_KEY;
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const WHOP_APP_ID = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';

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

    // Intercambiar código por token de acceso
    if (!WHOP_API_KEY || !WHOP_CLIENT_SECRET) {
      console.error('WHOP_API_KEY o WHOP_CLIENT_SECRET no están configuradas');
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Construir redirect_uri - debe coincidir EXACTAMENTE con el registrado en Whop
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;

    console.log('=== OAUTH TOKEN EXCHANGE ===');
    console.log('Redirect URI:', redirectUri);
    console.log('Client ID:', WHOP_APP_ID);
    console.log('Has API Key:', !!WHOP_API_KEY);
    console.log('Has Client Secret:', !!WHOP_CLIENT_SECRET);

    // Intercambiar código por token usando la API de Whop
    const tokenResponse = await fetch('https://api.whop.com/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WHOP_API_KEY}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: WHOP_APP_ID,
        client_secret: WHOP_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Error exchanging code for token:', tokenResponse.status, errorText);
      console.error('Make sure the redirect_uri in Whop matches exactly:', redirectUri);
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const userId = tokenData.user_id;

    if (!accessToken || !userId) {
      console.error('No se recibió access_token o user_id en la respuesta');
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
    }

    // Verificar que el usuario tenga acceso al producto usando checkAccess API
    if (!WHOP_API_KEY) {
      console.error('WHOP_API_KEY no está configurada');
      // Redirigir al dashboard con mensaje de error
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    try {
      const accessCheck = await checkWhopAccess(userId, WHOP_PRODUCT_ID, WHOP_API_KEY);

      console.log('=== VERIFICACIÓN DE ACCESO EN CALLBACK ===');
      console.log('Usuario:', userId);
      console.log('Producto:', WHOP_PRODUCT_ID);
      console.log('has_access:', accessCheck.has_access);
      console.log('access_level:', accessCheck.access_level);

      // Solo permitir acceso si el usuario tiene membresía activa (customer) o es admin
      if (!accessCheck.has_access || accessCheck.access_level === 'no_access') {
        console.log('❌ Usuario no tiene acceso');
        // Redirigir al dashboard con mensaje de que no tiene acceso
        // El middleware se encargará de bloquear el acceso a las rutas protegidas
        return NextResponse.redirect(new URL('/?error=no_access', request.url));
      }

      // Si tiene acceso (customer o admin), continuar con el proceso de autenticación
      console.log('✅ Usuario tiene acceso, continuando con autenticación');
    } catch (error) {
      console.error('Error verificando acceso:', error);
      // En caso de error, permitir login pero el middleware verificará después
      // Redirigir al dashboard
      return NextResponse.redirect(new URL('/?error=access_check_failed', request.url));
    }

    // Usuario tiene acceso, establecer cookies de sesión
    const cookieStore = await cookies();
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
    // Redirigir al dashboard con mensaje de error
    return NextResponse.redirect(new URL('/?error=authentication_failed', request.url));
  }
}

