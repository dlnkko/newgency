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

    const normalizedEmail = email.toLowerCase().trim();

    // Primero, intentar buscar todos los usuarios para ver qué hay
    const { data: allUsers, error: allError } = await supabase
      .from('whop_users')
      .select('email, status, whop_user_id');

    // Buscar el usuario específico
    const { data: userData, error: userError } = await supabase
      .from('whop_users')
      .select('email, status, whop_user_id')
      .eq('email', normalizedEmail)
      .single();

    // También buscar sin el .single() para ver si hay múltiples resultados
    const { data: multipleUsers, error: multipleError } = await supabase
      .from('whop_users')
      .select('email, status, whop_user_id')
      .eq('email', normalizedEmail);

    return NextResponse.json({
      debug: {
        emailBuscado: normalizedEmail,
        emailOriginal: email,
      },
      todosLosUsuarios: allUsers || [],
      errorTodosUsuarios: allError,
      usuarioEncontrado: userData || null,
      errorUsuario: userError,
      usuariosMultiples: multipleUsers || [],
      errorMultiples: multipleError,
      analisis: {
        usuarioExiste: !!userData,
        statusEncontrado: userData?.status || null,
        esActive: userData?.status === 'active',
        cantidadCoincidencias: multipleUsers?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('Error en debug:', error);
    return NextResponse.json(
      { error: error.message || 'Error al verificar el email', stack: error.stack },
      { status: 500 }
    );
  }
}

