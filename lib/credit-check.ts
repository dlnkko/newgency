import { NextRequest, NextResponse } from 'next/server';
import { consumeCredit } from './credits';

/**
 * Verifica y consume un crédito antes de permitir una generación
 * Retorna null si está permitido, o una respuesta de error si no
 */
export async function verifyAndConsumeCredit(request: NextRequest): Promise<NextResponse | null> {
  const result = await consumeCredit(request);
  
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        details: result.error || 'You do not have enough credits to perform this action.',
        remainingCredits: result.remainingCredits
      },
      { status: 402 } // Payment Required
    );
  }

  return null; // Crédito consumido exitosamente
}



