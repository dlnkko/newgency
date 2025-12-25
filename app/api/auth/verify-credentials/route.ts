import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint para verificar que las credenciales estén configuradas correctamente
 * NO expone los valores reales, solo verifica que existan
 */
export async function GET(request: NextRequest) {
  const whopAppId = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
  const hasApiKey = !!process.env.WHOP_API_KEY;
  const hasClientSecret = !!process.env.WHOP_CLIENT_SECRET;
  
  const apiKeyPrefix = process.env.WHOP_API_KEY?.substring(0, 10) || 'NOT SET';
  const clientSecretPrefix = process.env.WHOP_CLIENT_SECRET?.substring(0, 10) || 'NOT SET';
  const apiKeyLength = process.env.WHOP_API_KEY?.length || 0;
  const clientSecretLength = process.env.WHOP_CLIENT_SECRET?.length || 0;
  
  // Verificar si son iguales (no deberían serlo)
  const areSame = process.env.WHOP_API_KEY === process.env.WHOP_CLIENT_SECRET;
  
  return NextResponse.json({
    message: 'Credential Verification',
    status: hasApiKey && hasClientSecret ? '✅ All credentials are set' : '❌ Missing credentials',
    details: {
      appId: {
        value: whopAppId,
        status: whopAppId ? '✅' : '❌'
      },
      apiKey: {
        status: hasApiKey ? '✅ Set' : '❌ Missing',
        prefix: apiKeyPrefix,
        length: apiKeyLength,
        note: hasApiKey ? 'API Key is configured' : 'WHOP_API_KEY is not set in Vercel'
      },
      clientSecret: {
        status: hasClientSecret ? '✅ Set' : '❌ Missing',
        prefix: clientSecretPrefix,
        length: clientSecretLength,
        note: hasClientSecret ? 'Client Secret is configured' : 'WHOP_CLIENT_SECRET is not set in Vercel'
      },
      importantNote: areSame && hasApiKey && hasClientSecret 
        ? '⚠️ WARNING: API Key and Client Secret are the same. This might be correct for Whop, but verify in your Whop dashboard that these should be different values.'
        : '✅ API Key and Client Secret are different (as expected)'
    },
    instructions: [
      '1. Go to https://dev.whop.com/ and select your app',
      '2. Go to the OAuth section',
      '3. Copy the "Clave secreta del cliente" (Client Secret)',
      '4. Make sure WHOP_CLIENT_SECRET in Vercel matches EXACTLY',
      '5. Copy the API Key (from Developer settings)',
      '6. Make sure WHOP_API_KEY in Vercel matches EXACTLY',
      '7. Note: Client Secret and API Key are usually DIFFERENT values'
    ]
  });
}

