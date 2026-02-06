import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { addUserGenerations } from '@/lib/generations';

/**
 * POST: Comprar generaciones adicionales
 * Por ahora, simula la compra. En producción, integrarías con Stripe
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { amount = 500 } = body; // Por defecto 500 generaciones

    if (amount !== 500) {
      return NextResponse.json(
        { error: 'Solo se pueden comprar 500 generaciones a la vez' },
        { status: 400 }
      );
    }

    // TODO: Aquí integrarías con Stripe Checkout
    // Por ahora, simulamos que el pago fue exitoso
    // En producción, deberías:
    // 1. Crear una sesión de Stripe Checkout
    // 2. Redirigir al usuario a Stripe
    // 3. En el webhook de Stripe, llamar a addUserGenerations

    // Simulación: agregar generaciones directamente
    const result = await addUserGenerations(request, amount);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error al agregar generaciones' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Se agregaron ${amount} generaciones a tu cuenta`,
      amount
    });
  } catch (error: any) {
    console.error('Error purchasing generations:', error);
    return NextResponse.json(
      { error: error.message || 'Error al comprar generaciones' },
      { status: 500 }
    );
  }
}






