import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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

    // Verificar si el usuario ya existe en Supabase Auth
    const { data: { user: existingUser } } = await supabase.auth.getUser();

    if (existingUser && existingUser.email?.toLowerCase() === normalizedEmail) {
      // Usuario ya autenticado, solo verificar membresía
      return response;
    }

    // Crear o obtener usuario en Supabase Auth usando magic link
    // Enviar magic link que se procesará automáticamente
    const { data: signInData, error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?auto=true`,
        shouldCreateUser: true,
      },
    });

    if (signInError) {
      console.error('Error enviando magic link:', signInError);
      // Si falla, intentar crear sesión directa con password temporal
      // Pero mejor usar el magic link
      return NextResponse.json(
        { error: 'Error al crear sesión. Por favor, intenta de nuevo.' },
        { status: 500 }
      );
    }

    // Retornar éxito - el usuario recibirá el magic link
    // Pero mejor: crear una sesión temporal basada en el email verificado
    // Usar un token JWT temporal o cookie de sesión
    return response;
  } catch (error: any) {
    console.error('Error en auto-login:', error);
    return NextResponse.json(
      { error: error.message || 'Error al iniciar sesión' },
      { status: 500 }
    );
  }
}

