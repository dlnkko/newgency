import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url));
  
  // Eliminar cookies de sesión
  response.cookies.delete('whop_session_token');
  response.cookies.delete('whop_user_id');
  
  return response;
}

