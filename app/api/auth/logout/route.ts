import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const response = NextResponse.redirect(new URL('/login', request.url));
    
    // Eliminar cookie de sesión
    response.cookies.delete('app_session');
    
    return response;
  } catch (error: any) {
    console.error('Error en logout:', error);
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('app_session');
    return response;
  }
}
