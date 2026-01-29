import { NextRequest, NextResponse } from 'next/server';
import { checkUserGenerations, incrementUserGenerations } from './generations';

/**
 * Verifica si el usuario tiene generaciones disponibles
 * Retorna null si está permitido, o una respuesta de error si no
 */
export async function verifyUserGenerations(request: NextRequest): Promise<NextResponse | null> {
  const generationsCheck = await checkUserGenerations(request);
  
  if (!generationsCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Generations limit exceeded',
        details: `You have used all ${generationsCheck.limit} generations. Please purchase more to continue.`,
        remaining: 0,
        limit: generationsCheck.limit,
        used: generationsCheck.used
      },
      { status: 403 }
    );
  }

  return null; // Usuario tiene generaciones disponibles
}

/**
 * Incrementa el contador de generaciones del usuario después de una generación exitosa
 */
export async function recordGeneration(request: NextRequest): Promise<void> {
  try {
    await incrementUserGenerations(request);
  } catch (error) {
    console.error('Error recording generation:', error);
    // No lanzamos error para no interrumpir la respuesta exitosa
  }
}



