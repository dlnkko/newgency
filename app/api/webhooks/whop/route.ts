import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const whopProductId = process.env.WHOP_PRODUCT_ID || '';
const whopWebhookSecret = process.env.WHOP_WEBHOOK_SECRET || '';

/**
 * Verifica la firma del webhook de Whop
 */
function verifyWhopSignature(body: string, signature: string): boolean {
  if (!whopWebhookSecret) {
    console.warn('WHOP_WEBHOOK_SECRET not configured, skipping signature verification');
    return true; // En desarrollo, permitir sin verificación
  }

  const hmac = crypto.createHmac('sha256', whopWebhookSecret);
  const digest = hmac.update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Obtiene el ID del usuario desde el email o ID de Whop
 */
async function getUserIdFromWhopData(whopData: any, supabase: any): Promise<string | null> {
  // Intentar obtener por email
  if (whopData.user?.email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', whopData.user.email.toLowerCase())
      .single();
    
    if (profile) {
      return profile.id;
    }
  }

  // Intentar obtener por whop_user_id si existe
  if (whopData.user?.id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('whop_user_id', whopData.user.id.toString())
      .single();
    
    if (profile) {
      return profile.id;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Verificar que tenemos las variables de entorno necesarias
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Leer el body como texto para verificación de firma
    const bodyText = await request.text();
    const signature = request.headers.get('x-whop-signature') || '';

    // Verificar firma del webhook
    if (!verifyWhopSignature(bodyText, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parsear el body
    const whopData = JSON.parse(bodyText);

    // Verificar que es un evento de pago exitoso
    if (whopData.type !== 'payment.succeeded' && whopData.type !== 'checkout.completed') {
      console.log(`Ignoring webhook type: ${whopData.type}`);
      return NextResponse.json({ received: true });
    }

    // Verificar que el producto es el de 500 créditos
    const productId = whopData.product?.id || whopData.product_id || '';
    if (whopProductId && productId !== whopProductId) {
      console.log(`Product ID mismatch. Expected: ${whopProductId}, Got: ${productId}`);
      return NextResponse.json({ received: true });
    }

    // Crear cliente de Supabase con service role (bypass RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Obtener el ID del usuario
    const userId = await getUserIdFromWhopData(whopData, supabaseAdmin);

    if (!userId) {
      console.error('Could not find user for Whop data:', whopData.user);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Agregar 500 créditos usando la función RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('add_credits', {
      user_id: userId,
      amount: 500
    });

    if (rpcError) {
      console.error('Error adding credits:', rpcError);
      return NextResponse.json(
        { error: 'Failed to add credits', details: rpcError.message },
        { status: 500 }
      );
    }

    if (!rpcResult) {
      console.error('RPC function returned false');
      return NextResponse.json(
        { error: 'Failed to add credits' },
        { status: 500 }
      );
    }

    console.log(`Successfully added 500 credits to user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Credits added successfully',
      userId,
      creditsAdded: 500
    });

  } catch (error: any) {
    console.error('Error processing Whop webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}





