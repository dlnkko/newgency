import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkWhopAccess } from '@/lib/whop-access';

// NOTA: La App de Whop NO necesita publicarse
// Solo se usa para obtener credenciales OAuth (Client ID y Client Secret)
// El Product ID es de tu comunidad/producto real que quieres proteger

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
    // Usar el origin de la request para que funcione tanto en producción como desarrollo
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/callback`;

    console.log('=== OAUTH TOKEN EXCHANGE ===');
    console.log('Redirect URI:', redirectUri);
    console.log('Client ID:', WHOP_APP_ID);
    console.log('Client ID length:', WHOP_APP_ID?.length);
    console.log('Has API Key:', !!WHOP_API_KEY);
    console.log('Has Client Secret:', !!WHOP_CLIENT_SECRET);
    console.log('Client Secret length:', WHOP_CLIENT_SECRET?.length);
    
    // Validar que el Client ID tenga el formato correcto
    if (WHOP_APP_ID && !WHOP_APP_ID.startsWith('app_')) {
      console.error('❌ ERROR: NEXT_PUBLIC_WHOP_APP_ID debe empezar con "app_"');
      console.error('❌ Valor actual:', WHOP_APP_ID);
      console.error('❌ Si empieza con "prod_", estás usando el Product ID en lugar del App ID');
      console.error('❌ Ve a https://dev.whop.com/ → Tu App → OAuth para obtener el Client ID correcto');
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }
    
    // Validar que el Client Secret exista
    if (!WHOP_CLIENT_SECRET) {
      console.error('❌ ERROR: WHOP_CLIENT_SECRET no está configurada');
      console.error('❌ Ve a https://dev.whop.com/ → Tu App → OAuth para obtener el Client Secret');
      return NextResponse.redirect(new URL('/?error=config_error', request.url));
    }

    // Intercambiar código por token usando la API de Whop
    // Intentar múltiples formatos según estándares OAuth2
    let tokenResponse: Response | null = null;
    let lastError: string | null = null;

    // Formato 1: application/x-www-form-urlencoded (estándar OAuth2)
    try {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', code);
      formData.append('client_id', WHOP_APP_ID);
      formData.append('client_secret', WHOP_CLIENT_SECRET);
      formData.append('redirect_uri', redirectUri);

      console.log('Intentando formato 1: application/x-www-form-urlencoded');
      tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (tokenResponse.ok) {
        console.log('✅ Token exchange exitoso con formato form-urlencoded');
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

    // Formato 2: Basic Auth + JSON body
    if (!tokenResponse || !tokenResponse.ok) {
      try {
        const basicAuth = Buffer.from(`${WHOP_APP_ID}:${WHOP_CLIENT_SECRET}`).toString('base64');
        
        console.log('Intentando formato 2: Basic Auth + JSON');
        tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basicAuth}`,
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
          }),
        });

        if (tokenResponse.ok) {
          console.log('✅ Token exchange exitoso con formato Basic Auth');
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

    // Formato 3: JSON body sin Basic Auth (formato original)
    if (!tokenResponse || !tokenResponse.ok) {
      try {
        console.log('Intentando formato 3: JSON body (formato original)');
        tokenResponse = await fetch('https://data.whop.com/api/v5/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: code,
            client_id: WHOP_APP_ID,
            client_secret: WHOP_CLIENT_SECRET,
            redirect_uri: redirectUri,
          }),
        });

        if (tokenResponse.ok) {
          console.log('✅ Token exchange exitoso con formato JSON');
        } else {
          const errorText = await tokenResponse.text();
          console.log('❌ Formato 3 falló:', tokenResponse.status, errorText);
          lastError = errorText;
        }
      } catch (error: any) {
        console.log('❌ Error en formato 3:', error.message);
        lastError = error.message;
      }
    }

    if (!tokenResponse || !tokenResponse.ok) {
      const errorText = lastError || (tokenResponse ? await tokenResponse.text() : 'No se pudo conectar con la API de Whop');
      console.error('❌ Error exchanging code for token:', tokenResponse?.status || 'NO_RESPONSE', errorText);
      console.error('=== INFORMACIÓN DE DEBUG ===');
      console.error('Redirect URI usado:', redirectUri);
      console.error('Redirect URI debe coincidir EXACTAMENTE en Whop');
      console.error('Client ID usado:', WHOP_APP_ID);
      console.error('Client ID longitud:', WHOP_APP_ID?.length || 0);
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

