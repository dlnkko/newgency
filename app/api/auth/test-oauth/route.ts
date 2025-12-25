import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint de debug para verificar la configuración de OAuth
 * Útil para diagnosticar problemas con auth_failed
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const whopAppId = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
  const hasApiKey = !!process.env.WHOP_API_KEY;
  const hasClientSecret = !!process.env.WHOP_CLIENT_SECRET;
  const clientSecretLength = process.env.WHOP_CLIENT_SECRET?.length || 0;

  return NextResponse.json({
    message: 'OAuth Configuration Debug',
    configuration: {
      origin: origin,
      redirectUri: redirectUri,
      whopAppId: whopAppId,
      hasApiKey: hasApiKey,
      hasClientSecret: hasClientSecret,
      clientSecretLength: clientSecretLength,
      oauthUrl: `https://whop.com/oauth?client_id=${whopAppId}&redirect_uri=${encodeURIComponent(redirectUri)}`
    },
    checklist: [
      {
        item: 'Redirect URI registered in Whop',
        value: redirectUri,
        note: 'Make sure this EXACT URL is registered in your Whop app settings'
      },
      {
        item: 'WHOP_API_KEY configured',
        status: hasApiKey ? '✅' : '❌',
        note: hasApiKey ? 'API Key is set' : 'API Key is missing - check Vercel environment variables'
      },
      {
        item: 'WHOP_CLIENT_SECRET configured',
        status: hasClientSecret ? '✅' : '❌',
        note: hasClientSecret ? `Client Secret is set (${clientSecretLength} chars)` : 'Client Secret is missing - check Vercel environment variables'
      },
      {
        item: 'NEXT_PUBLIC_WHOP_APP_ID configured',
        status: whopAppId ? '✅' : '❌',
        value: whopAppId,
        note: whopAppId ? 'App ID is set' : 'App ID is missing'
      }
    ],
    nextSteps: [
      '1. Verify all environment variables are set in Vercel',
      '2. Make sure the redirect_uri above is registered in Whop',
      '3. Try logging in and check Vercel logs for detailed error messages',
      '4. The error message in logs will show exactly what Whop API is rejecting'
    ]
  });
}

