import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkUserAccess } from '@/lib/whop-sdk';

const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID || process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';

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

  // Obtener el user_id de las cookies
  const whopUserId = request.cookies.get('whop_user_id')?.value;

  // Si no hay sesión, permitir acceso a la página principal para mostrar el botón de login
  if (!whopUserId) {
    if (pathname === '/') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Verificar acceso usando el SDK de Whop
  try {
    console.log('=== VERIFICACIÓN DE ACCESO EN MIDDLEWARE (SDK) ===');
    console.log('Usuario:', whopUserId);
    console.log('Producto:', WHOP_PRODUCT_ID);

    const accessCheck = await checkUserAccess(whopUserId, WHOP_PRODUCT_ID);

    if (accessCheck.hasAccess) {
      if (accessCheck.isAdmin) {
        console.log('✅ Usuario es ADMIN, permitiendo acceso');
      } else {
        console.log('✅ Usuario tiene acceso (membresía activa)');
      }
      return NextResponse.next();
    }

    // Usuario no tiene acceso, redirigir a página de error/venta
    console.log('❌ Usuario no tiene acceso');
    console.log('Access level:', accessCheck.accessLevel);
    return NextResponse.redirect(new URL(`/no-access?error=${encodeURIComponent(accessCheck.error || 'no_access')}`, request.url));
  } catch (error: any) {
    console.error('Error verificando acceso en middleware:', error);
    
    // Si hay error, redirigir a login
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
    const whopAuthUrl = `https://whop.com/oauth?client_id=${WHOP_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return NextResponse.redirect(whopAuthUrl);
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
