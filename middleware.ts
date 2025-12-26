import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso a rutas públicas (solo API y assets estáticos)
  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/_vercel') ||
    pathname.startsWith('/no-access') ||
    pathname === '/login'
  ) {
    return NextResponse.next();
  }

  // Para la ruta raíz, verificar sesión y redirigir apropiadamente
  if (pathname === '/') {
    const sessionCookie = request.cookies.get('app_session')?.value;
    
    if (!sessionCookie) {
      // Si no hay sesión, redirigir al login
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const sessionData = JSON.parse(sessionCookie);
      const userEmail = sessionData.email?.toLowerCase();

      if (!userEmail || !sessionData.verified) {
        // Si la sesión no es válida, redirigir al login
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('app_session');
        return response;
      }

      // Verificar que el usuario tenga membresía activa
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      
      if (!supabaseUrl || !supabaseAnonKey) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('app_session');
        return response;
      }

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get() { return undefined; },
          set() {},
          remove() {},
        },
      });

      const { data: whopUser, error: whopError } = await supabase
        .from('whop_users')
        .select('email, status')
        .eq('email', userEmail)
        .single();

      // Si no está activo, redirigir al login
      if (whopError || !whopUser || whopUser.status !== 'active') {
        const response = NextResponse.redirect(new URL('/login?error=no_active_membership', request.url));
        response.cookies.delete('app_session');
        return response;
      }

      // Si hay sesión válida y status activo, redirigir al dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } catch (error) {
      // Si hay error, redirigir al login
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('app_session');
      return response;
    }
  }

  // Proteger rutas que empiezan con /dashboard o /tools
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/tools')) {
    const response = NextResponse.next();
    
    // Obtener la sesión de la cookie
    const sessionCookie = request.cookies.get('app_session')?.value;
    
    if (!sessionCookie) {
      // Si no hay cookie de sesión, redirigir al login
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      // Parsear la sesión
      const sessionData = JSON.parse(sessionCookie);
      const userEmail = sessionData.email?.toLowerCase();

      if (!userEmail || !sessionData.verified) {
        // Si la sesión no es válida, redirigir al login
        response.cookies.delete('app_session');
        return NextResponse.redirect(new URL('/login', request.url));
      }

      // Crear cliente de Supabase para verificar el status
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      
      if (!supabaseUrl || !supabaseAnonKey) {
        response.cookies.delete('app_session');
        return NextResponse.redirect(new URL('/login', request.url));
      }

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get() { return undefined; },
          set() {},
          remove() {},
        },
      });

      // Verificar en tiempo real que el usuario tenga membresía activa
      // Esto consulta directamente la base de datos, por lo que si el webhook de Whop
      // actualiza el status a 'inactive', el usuario será expulsado en la siguiente petición
      const { data: whopUser, error: whopError } = await supabase
        .from('whop_users')
        .select('email, status')
        .eq('email', userEmail)
        .single();

      // Si hay error al consultar o el usuario no existe o no está activo, expulsar
      if (whopError || !whopUser || whopUser.status !== 'active') {
        console.log(`Usuario ${userEmail} expulsado: status=${whopUser?.status || 'no encontrado'}, error=${whopError?.message || 'none'}`);
        
        // Limpiar cookie de sesión
        response.cookies.delete('app_session');
        
        return NextResponse.redirect(
          new URL('/login?error=no_active_membership', request.url)
        );
      }

      // Usuario tiene sesión válida y membresía activa, permitir acceso
      return response;
    } catch (error) {
      console.error('Error en middleware:', error);
      // En caso de error, limpiar sesión y redirigir
      response.cookies.delete('app_session');
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth/login (ruta de login)
     * - api/auth/logout (ruta de logout)
     * - api (otras rutas API)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth/login|api/auth/logout|api|_next/static|_next/image|favicon.ico).*)',
  ],
};
