import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase configuration not found' },
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
        { error: 'You do not have an active membership' },
        { status: 403 }
      );
    }

    // Verificar si ya hay una sesión activa
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    
    if (existingSession && existingSession.user.email?.toLowerCase() === normalizedEmail) {
      return response;
    }

    // Enviar magic link que se procesará automáticamente
    // El usuario recibirá el email y al hacer clic, se creará la sesión
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback?auto=true`,
        shouldCreateUser: true,
      },
    });

    if (signInError) {
      console.error('Error enviando magic link:', signInError);
      return NextResponse.json(
        { error: 'Error creating session. Please try again.' },
        { status: 500 }
      );
    }

    return response;
  } catch (error: any) {
    console.error('Error en create-session:', error);
    return NextResponse.json(
      { error: error.message || 'Error creating session' },
      { status: 500 }
    );
  }
}

