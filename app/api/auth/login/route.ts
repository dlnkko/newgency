import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

    // Crear cliente de Supabase para el servidor
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    });

    // Normalizar el email (lowercase y trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Buscar el usuario en la tabla whop_users
    const { data, error } = await supabase
      .from('whop_users')
      .select('email, status')
      .eq('email', normalizedEmail)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'No tienes una membresía activa' },
        { status: 403 }
      );
    }

    // Verificar que el status sea 'active'
    if (data.status !== 'active') {
      return NextResponse.json(
        { error: 'No tienes una membresía activa' },
        { status: 403 }
      );
    }

    // Crear respuesta y establecer cookie de sesión
    const response = NextResponse.json({
      success: true,
      email: data.email,
    });

    // Establecer cookie de sesión (válida por 30 días)
    const sessionData = {
      email: normalizedEmail,
      verified: true,
      timestamp: Date.now(),
    };

    response.cookies.set('app_session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 días
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error en login:', error);
    return NextResponse.json(
      { error: error.message || 'Error al iniciar sesión' },
      { status: 500 }
    );
  }
}

