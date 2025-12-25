import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkWhopAccess } from '@/lib/whop-access';

const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';
const WHOP_APP_ID = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso a rutas públicas (callback de auth, logout, debug, API routes, etc.)
  if (
    pathname.startsWith('/api/auth/callback') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/auth/debug') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/_vercel')
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

  // Verificar acceso del usuario al producto usando checkAccess API
  try {
    const whopApiKey = process.env.WHOP_API_KEY;
    if (!whopApiKey) {
      console.error('WHOP_API_KEY no está configurada');
      return NextResponse.redirect('https://whop.com');
    }

    // Usar la API oficial checkAccess de Whop
    const accessCheck = await checkWhopAccess(whopUserId, WHOP_PRODUCT_ID, whopApiKey);

    console.log('=== VERIFICACIÓN DE ACCESO WHOP ===');
    console.log('Usuario:', whopUserId);
    console.log('Producto:', WHOP_PRODUCT_ID);
    console.log('has_access:', accessCheck.has_access);
    console.log('access_level:', accessCheck.access_level);

    // Si el usuario es admin (según Whop), permitir acceso
    if (accessCheck.access_level === 'admin') {
      console.log('✅ Usuario es admin de Whop, permitiendo acceso');
      return NextResponse.next();
    }

    // Si el usuario tiene acceso como customer (membresía activa), permitir acceso
    if (accessCheck.has_access && accessCheck.access_level === 'customer') {
      console.log('✅ Usuario tiene membresía activa, permitiendo acceso');
      return NextResponse.next();
    }

    // Usuario no tiene acceso, redirigir al dashboard con mensaje
    console.log('❌ Usuario no tiene acceso, redirigiendo al dashboard');
    return NextResponse.redirect(new URL('/?error=no_access', request.url));
  } catch (error: any) {
    console.error('Error verificando acceso en middleware de Whop:', error);
    console.error('Error details:', error?.message || error);
    // En caso de error en checkAccess, permitir acceso temporalmente
    // Esto es especialmente importante para creadores/admins
    console.log('⚠️ Error en checkAccess, permitiendo acceso temporalmente');
    console.log('Usuario:', whopUserId);
    return NextResponse.next();
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

