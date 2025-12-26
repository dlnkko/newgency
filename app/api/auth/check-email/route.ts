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
    
    console.log('🔍 Buscando usuario con email:', normalizedEmail);

    // Buscar el usuario en la tabla whop_users
    const { data, error } = await supabase
      .from('whop_users')
      .select('email, status')
      .eq('email', normalizedEmail)
      .single();

    console.log('📊 Resultado de la consulta:', { data, error });

    if (error) {
      // Si no se encuentra el usuario, retornar error
      if (error.code === 'PGRST116') {
        console.log('❌ Usuario no encontrado en la base de datos');
        return NextResponse.json(
          { error: 'No tienes una membresía activa', status: 'not_found' },
          { status: 403 }
        );
      }
      console.error('❌ Error en la consulta:', error);
      throw error;
    }

    if (!data) {
      console.log('❌ No se encontraron datos para el usuario');
      return NextResponse.json(
        { error: 'No tienes una membresía activa', status: 'not_found' },
        { status: 403 }
      );
    }

    console.log('✅ Usuario encontrado:', { email: data.email, status: data.status });

    // Verificar que el status sea exactamente 'active' (case-sensitive)
    if (data.status !== 'active') {
      console.log(`⚠️ Usuario encontrado pero status es '${data.status}', no 'active'`);
      return NextResponse.json(
        { 
          error: 'No tienes una membresía activa', 
          status: data.status,
          found: true 
        },
        { status: 403 }
      );
    }

    console.log('✅ Usuario tiene membresía activa');
    return NextResponse.json({
      email: data.email,
      status: data.status,
    });
  } catch (error: any) {
    console.error('Error verificando email:', error);
    return NextResponse.json(
      { error: error.message || 'Error al verificar el email' },
      { status: 500 }
    );
  }
}
