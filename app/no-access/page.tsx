'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const WHOP_PRODUCT_ID = process.env.NEXT_PUBLIC_WHOP_PRODUCT_ID || 'prod_ZfB8PwCxIaiC2';

function NoAccessContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');

  const getErrorMessage = (errorCode: string | null) => {
    if (!errorCode) return null;
    
    const messages: Record<string, string> = {
      'no_access': 'No tienes acceso a esta aplicación. Necesitas una membresía activa.',
      'Usuario no tiene membresía para este producto': 'No tienes una membresía para este producto.',
      'Usuario no tiene membresías': 'No tienes membresías activas.',
      'Membresía existe pero está inactive': 'Tu membresía está inactiva. Por favor, reactívala.',
      'Membresía existe pero está cancelled': 'Tu membresía ha sido cancelada.',
      'Membresía existe pero está expired': 'Tu membresía ha expirado.',
      'Token de acceso inválido o expirado': 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
    };
    
    return messages[errorCode] || 'No tienes acceso a esta aplicación.';
  };

  const errorMessage = getErrorMessage(error);

  // Construir URL de compra de Whop (ajusta según tu configuración)
  const whopProductUrl = `https://whop.com/products/${WHOP_PRODUCT_ID}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-red-500/20 p-4">
              <svg
                className="w-12 h-12 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
          <h1 className="mb-4 text-4xl font-bold text-zinc-50 sm:text-5xl">
            Acceso Restringido
          </h1>
          {errorMessage && (
            <p className="text-lg text-red-400 mb-4">
              {errorMessage}
            </p>
          )}
          <p className="text-zinc-400 mb-8">
            Esta aplicación está disponible solo para miembros activos de la comunidad.
          </p>
        </div>

        <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-950/90 to-black rounded-2xl border-2 border-zinc-800/70 p-8">
          <h2 className="text-xl font-semibold text-zinc-50 mb-4">
            ¿No tienes una membresía?
          </h2>
          <p className="text-zinc-300 mb-6">
            Únete a nuestra comunidad para acceder a todas las herramientas exclusivas.
          </p>
          
          <a
            href={whopProductUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-amber-500/50 flex items-center justify-center gap-3 mb-4"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Obtener Membresía
          </a>

          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Volver al inicio
          </Link>
        </div>

        <div className="mt-8 text-sm text-zinc-500">
          <p>
            ¿Ya tienes una membresía?{' '}
            <Link href="/api/auth/logout" className="text-amber-400 hover:text-amber-300">
              Cierra sesión
            </Link>
            {' '}e inicia sesión nuevamente.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NoAccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 flex items-center justify-center px-4">
          <div className="text-zinc-400">Cargando...</div>
        </div>
      }
    >
      <NoAccessContent />
    </Suspense>
  );
}

