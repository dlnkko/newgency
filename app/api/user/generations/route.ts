import { NextRequest, NextResponse } from 'next/server';
import { getUserGenerations } from '@/lib/generations';

/**
 * GET: Obtener el estado de generaciones del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const generations = await getUserGenerations(request);
    
    if (!generations) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      ...generations
    });
  } catch (error: any) {
    console.error('Error getting generations:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener generaciones' },
      { status: 500 }
    );
  }
}



