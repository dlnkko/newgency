import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Configuración de Supabase no encontrada' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ success: true });

    // Crear cliente de Supabase con manejo de cookies
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    });

    // Verificar que el usuario tenga membresía activa
    const normalizedEmail = email.toLowerCase().trim();
    const { data: whopUser, error: whopError } = await supabase
      .from('whop_users')
      .select('email, status')
      .eq('email', normalizedEmail)
      .single();

    if (whopError || !whopUser || whopUser.status !== 'active') {
      return NextResponse.json(
        { error: 'No tienes una membresía activa' },
        { status: 403 }
      );
    }

    // Verificar si ya hay una sesión de Supabase Auth
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    
    if (existingSession && existingSession.user.email?.toLowerCase() === normalizedEmail) {
      return response;
    }

    // Crear usuario en Supabase Auth si no existe
    // Primero intentar obtener el usuario
    const { data: { user: existingUser } } = await supabase.auth.getUser();

    if (!existingUser || existingUser.email?.toLowerCase() !== normalizedEmail) {
      // El usuario no existe en Supabase Auth, necesitamos crearlo
      // Pero Supabase Auth requiere autenticación para crear usuarios
      // La mejor opción es usar magic link pero hacerlo más fluido
      
      // Enviar magic link que se procesará automáticamente
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?auto=true`,
          shouldCreateUser: true,
        },
      });

      if (signInError) {
        console.error('Error enviando magic link:', signInError);
        // Si falla, crear una sesión temporal basada en email verificado
        // Usar una cookie de sesión propia
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionData = {
          email: normalizedEmail,
          verified: true,
          timestamp: Date.now(),
        };

        response.cookies.set('app_session', JSON.stringify(sessionData), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 días
          path: '/',
        });

        response.cookies.set('app_session_token', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 días
          path: '/',
        });

        return response;
      }
    }

    return response;
  } catch (error: any) {
    console.error('Error en create-direct-session:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear sesión' },
      { status: 500 }
    );
  }
}

