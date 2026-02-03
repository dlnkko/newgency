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
 * Obtiene o crea el usuario completo en todas las tablas necesarias
 */
async function getOrCreateUserFromWhopData(whopData: any, supabaseAdmin: any): Promise<string | null> {
  const email = whopData.user?.email?.toLowerCase().trim();
  const whopUserId = whopData.user?.id?.toString();
  
  if (!email) {
    console.error('No email found in Whop data');
    return null;
  }

  // 1. Actualizar/crear en whop_users con status='active'
  const { error: whopUsersError } = await supabaseAdmin
    .from('whop_users')
    .upsert({
      whop_user_id: whopUserId || null,
      email: email,
      status: 'active',
      updated_at: new Date().toISOString()
    }, {
      onConflict: whopUserId ? 'whop_user_id' : 'email'
    });

  if (whopUsersError) {
    console.error('Error updating whop_users:', whopUsersError);
    // Continuar de todas formas
  }

  // 2. Buscar o crear usuario en Authentication
  let authUserId: string | null = null;
  
  // Buscar usuario existente en auth por email
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (!listError && users) {
    const existingUser = users.find((u: any) => u.email?.toLowerCase() === email);
    if (existingUser) {
      authUserId = existingUser.id;
    }
  }

  // Si no existe, crear usuario en Authentication
  if (!authUserId) {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true, // Confirmar email automáticamente
      user_metadata: {
        whop_user_id: whopUserId
      }
    });

    if (createError) {
      console.error('Error creating user in Authentication:', createError);
      return null;
    }

    authUserId = newUser.user.id;
    console.log(`Created user in Authentication: ${authUserId} for email: ${email}`);
  }

  // 3. Buscar o crear perfil en profiles
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', authUserId)
    .single();

  if (!existingProfile) {
    // Crear perfil si no existe
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUserId,
        email: email,
        credits: 0, // Se agregarán los créditos después
        whop_user_id: whopUserId || null
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Continuar de todas formas, puede que ya exista
    } else {
      console.log(`Created profile for user: ${authUserId}`);
    }
  } else {
    // Actualizar email y whop_user_id si es necesario
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        email: email,
        whop_user_id: whopUserId || null
      })
      .eq('id', authUserId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
    }
  }

  return authUserId;
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

    // Obtener o crear el usuario completo (whop_users, auth, profiles)
    const userId = await getOrCreateUserFromWhopData(whopData, supabaseAdmin);

    if (!userId) {
      console.error('Could not create/find user for Whop data:', whopData.user);
      return NextResponse.json(
        { error: 'Failed to create or find user' },
        { status: 500 }
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





