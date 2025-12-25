import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyWhopMembership } from '@/lib/whop-membership';

const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID || process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
const WHOP_API_KEY = process.env.WHOP_API_KEY;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso a rutas públicas (callback de auth, logout, debug, API routes, no-access, etc.)
  if (
    pathname.startsWith('/api/auth/callback') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/auth/debug') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/_vercel') ||
    pathname.startsWith('/no-access')
  ) {
    return NextResponse.next();
  }

  // Obtener el token de sesión de las cookies
  const sessionToken = request.cookies.get('whop_session_token')?.value;
  const whopUserId = request.cookies.get('whop_user_id')?.value;

  // Si no hay sesión, permitir acceso a la página principal para mostrar el botón de login
  // El botón redirigirá a Whop OAuth
  if (!sessionToken || !whopUserId) {
    // Permitir acceso a la página principal (/) para mostrar el botón de login
    if (pathname === '/') {
      return NextResponse.next();
    }
    // Para otras rutas, redirigir a la página principal
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Verificar membresía activa usando /api/v2/me
  try {
    console.log('=== VERIFICACIÓN DE MEMBRESÍA EN MIDDLEWARE ===');
    console.log('Usuario:', whopUserId);
    console.log('Producto:', WHOP_PRODUCT_ID);

    // Verificar membresía activa usando el access_token
    const membershipCheck = await verifyWhopMembership(sessionToken, WHOP_PRODUCT_ID, WHOP_API_KEY);

    if (membershipCheck.hasAccess) {
      if (membershipCheck.isAdmin) {
        console.log('✅ Usuario es ADMIN, permitiendo acceso');
      } else {
        console.log('✅ Usuario tiene membresía activa, permitiendo acceso');
        console.log('Membresía ID:', membershipCheck.membership?.id);
        console.log('Status:', membershipCheck.membership?.status);
      }
      return NextResponse.next();
    }

    // Usuario no tiene membresía activa, redirigir a página de error/venta
    console.log('❌ Usuario no tiene membresía activa');
    console.log('Error:', membershipCheck.error);
    return NextResponse.redirect(new URL(`/no-access?error=${encodeURIComponent(membershipCheck.error || 'no_access')}`, request.url));
  } catch (error: any) {
    console.error('Error verificando membresía en middleware:', error);
    
    // Si el token es inválido, redirigir a login
    if (error.message?.includes('inválido') || error.message?.includes('expirado')) {
      const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
      const whopAuthUrl = `https://whop.com/oauth?client_id=${WHOP_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return NextResponse.redirect(whopAuthUrl);
    }
    
    // En caso de otros errores, redirigir a página de error
    return NextResponse.redirect(new URL('/?error=access_check_failed', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth/callback (ruta de callback)
     * - api (otras rutas API)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth/callback|api|_next/static|_next/image|favicon.ico).*)',
  ],
};

