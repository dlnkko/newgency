import { NextRequest, NextResponse } from 'next/server';
import { getUserCredits } from '@/lib/credits';

/**
 * GET: Obtener el balance de créditos del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const creditsInfo = await getUserCredits(request);
    
    if (!creditsInfo) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      credits: creditsInfo.credits,
      userId: creditsInfo.userId
    });
  } catch (error: any) {
    console.error('Error getting credits:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener créditos' },
      { status: 500 }
    );
  }
}






