'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const tools = [
  {
    id: 'reverse-engineer',
    name: 'Reverse-engineer any AD',
    path: '/tools/reverse-engineer',
    description: 'Deconstruct high-performing ads',
    icon: '🔬',
    active: true
  },
  {
    id: 'video-prompt-generator',
    name: 'Video Prompt Generator',
    path: '/tools/video-prompt-generator',
    description: 'Create AI video prompts',
    icon: '🎬',
    active: true
  },
  {
    id: 'static-ad-prompt-generator',
    name: 'Static Ad Prompt Generator',
    path: '/tools/static-ad-prompt-generator',
    description: 'Generate static ad prompts from reference',
    icon: '🖼️',
    active: true
  },
  {
    id: 'product-video-generator',
    name: 'Product Video Generator',
    path: '/tools/product-video-generator',
    description: 'Generate professional product video prompts',
    icon: '📹',
    active: true
  },
  {
    id: 'viral-script-generator',
    name: 'Viral Script Generator',
    path: '/tools/viral-script-generator',
    description: 'Create viral UGC marketing scripts',
    icon: '🚀',
    active: true
  }
];

// Component that uses useSearchParams - must be wrapped in Suspense
function HomeContent() {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');

  useEffect(() => {
    // Verificar si el usuario está autenticado
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/debug');
        const data = await response.json();
        setIsAuthenticated(!!data.userId);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Error messages in English
  const getErrorMessage = (errorCode: string | null) => {
    if (!errorCode) return null;
    
    const messages: Record<string, string> = {
      'no_access': 'You do not have access to this software. You need an active membership.',
      'auth_failed': 'Authentication failed. Please try again.',
      'invalid_token': 'Error processing authentication. Please try again.',
      'config_error': 'Configuration error. Check that NEXT_PUBLIC_WHOP_APP_ID starts with "app_" (not "prod_") and WHOP_CLIENT_SECRET is correct. Get credentials from https://dev.whop.com/ → Your App → OAuth tab.',
      'access_check_failed': 'Error verifying your access. Please try again.',
      'authentication_failed': 'Authentication error. Please try again.',
      'invalid_client': 'Invalid client credentials. Verify your Client ID and Client Secret are correct. Make sure NEXT_PUBLIC_WHOP_APP_ID starts with "app_" and WHOP_CLIENT_SECRET matches the value from https://dev.whop.com/ → Your App → OAuth tab.',
      'redirect_uri_mismatch': 'Redirect URI mismatch. The redirect URI in Whop must match exactly: https://newgency.vercel.app/api/auth/callback',
    };
    
    return messages[errorCode] || 'An error occurred. Please try again.';
  };

  const handleWhopLogin = () => {
    // Usar el APP ID configurado (debe estar en NEXT_PUBLIC_WHOP_APP_ID)
    const whopAppId = process.env.NEXT_PUBLIC_WHOP_APP_ID || 'app_1NcIzCMmQK7kYR';
    // Construir redirect_uri - debe coincidir EXACTAMENTE con el registrado en Whop
    // IMPORTANTE: No agregar barra final (/)
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    // URL correcta de OAuth de Whop según documentación oficial
    const whopAuthUrl = `https://whop.com/oauth?client_id=${whopAppId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = whopAuthUrl;
  };

  // Mostrar pantalla de login si no está autenticado
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/80 mb-4">
              AI Ad Lab
            </p>
            <h1 className="mb-4 text-4xl font-bold text-zinc-50 sm:text-5xl">
              Welcome to AI Ad Lab
            </h1>
            <p className="text-lg text-zinc-400 mb-8">
              Access exclusive AI-powered ad creation tools
            </p>
          </div>

          <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-950/90 to-black rounded-2xl border-2 border-zinc-800/70 p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">
                  {getErrorMessage(error)}
                </p>
              </div>
            )}
            <p className="text-zinc-300 mb-6">
              Sign in with your Whop account to continue
            </p>
            <button
              onClick={handleWhopLogin}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-amber-500/50 flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              Entrar con Whop
            </button>
            <p className="text-xs text-zinc-500 mt-4">
              By signing in, you agree to verify your membership
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar contenido principal si está autenticado o mientras carga
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-4 py-6 sm:px-6 sm:py-10 lg:px-10 text-zinc-50">
      <div className="mx-auto w-full max-w-6xl">
        {/* Show error message if exists */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">
              {getErrorMessage(error)}
            </p>
          </div>
        )}
        
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/80">
              AI Ad Lab
            </p>
            {isAuthenticated && (
              <a
                href="/api/auth/logout"
                className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Cerrar sesión
              </a>
            )}
          </div>
          <h1 className="mb-4 text-4xl font-bold text-zinc-50 sm:text-5xl">
            A focused space for experimenting with next‑gen creative intelligence.
          </h1>
          <p className="text-lg text-zinc-400">
            Choose a tool to get started
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.filter(tool => tool.active).map((tool) => (
            <Link
              key={tool.id}
              href={tool.path}
              onMouseEnter={() => setHoveredTool(tool.id)}
              onMouseLeave={() => setHoveredTool(null)}
              className="group relative rounded-2xl border-2 border-zinc-800/70 bg-gradient-to-br from-zinc-900/90 via-zinc-950/90 to-black p-6 transition-all duration-300 hover:border-amber-500/60 hover:shadow-[0_0_45px_rgba(250,204,21,0.18)]"
            >
              {/* Icon */}
              <div className="mb-4 text-4xl transition-transform duration-300 group-hover:scale-110">
                {tool.icon}
              </div>

              {/* Tool Name */}
              <h3 className="mb-2 text-xl font-bold text-zinc-50 transition-colors duration-300 group-hover:text-amber-300">
                {tool.name}
              </h3>

              {/* Description */}
              <p className="text-sm text-zinc-400 transition-colors duration-300 group-hover:text-zinc-300">
                {tool.description}
              </p>

              {/* Hover Arrow */}
              <div className="mt-4 flex items-center text-sm font-semibold text-amber-400/70 opacity-0 transition-all duration-300 group-hover:translate-x-2 group-hover:opacity-100">
                <span>Open tool</span>
                <svg
                  className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* Live Badge */}
              <div className="absolute right-4 top-4">
                <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Live
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-500">
            Select a tool above to start creating
          </p>
        </div>
      </div>
    </div>
  );
}

// Main component wrapped in Suspense
export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 flex items-center justify-center px-4">
        <div className="text-zinc-400">Loading...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
