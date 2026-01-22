'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/app/components/DashboardLayout';

export default function SettingsPage() {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCredits();
    // Recargar créditos cada 30 segundos
    const interval = setInterval(loadCredits, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCredits = async () => {
    try {
      const response = await fetch('/api/user/credits');
      const data = await response.json();

      if (response.ok && data.success) {
        setCredits(data.credits || 0);
      }
    } catch (error) {
      console.error('Error loading credits:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = () => {
    const purchaseUrl = process.env.NEXT_PUBLIC_WHOP_PURCHASE_URL;
    if (purchaseUrl) {
      window.open(purchaseUrl, '_blank');
    } else {
      alert('URL de compra no configurada. Por favor, contacta al administrador.');
    }
  };

  const hasCredits = credits !== null && credits > 0;
  const isLow = credits !== null && credits < 10;

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver al Dashboard
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/70">
          Configuración
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Créditos
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Gestiona tus créditos para usar las herramientas de IA. Cada generación consume 1 crédito.
        </p>
      </div>

      <div className="space-y-8">
        {/* Credits Status */}
        {!isLoading && (
          <div className={`rounded-2xl border-2 p-8 ${
            hasCredits
              ? 'border-green-500/30 bg-green-950/20'
              : 'border-red-500/30 bg-red-950/20'
          }`}>
            <div className="flex items-start gap-6">
              <div className={`rounded-full p-4 ${
                hasCredits
                  ? 'bg-green-500/20'
                  : 'bg-red-500/20'
              }`}>
                {hasCredits ? (
                  <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h3 className={`text-2xl font-bold mb-2 ${
                  hasCredits ? 'text-green-300' : 'text-red-300'
                }`}>
                  {hasCredits ? 'Tienes Créditos Disponibles' : 'Sin Créditos'}
                </h3>
                <div className="mt-4">
                  <p className={`text-4xl font-bold mb-2 ${
                    hasCredits 
                      ? isLow 
                        ? 'text-amber-300' 
                        : 'text-green-300'
                      : 'text-red-300'
                  }`}>
                    {credits !== null ? credits : 0}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {hasCredits 
                      ? isLow 
                        ? 'Te quedan pocos créditos. Considera comprar más para continuar usando las herramientas.'
                        : 'Créditos disponibles para generar contenido.'
                      : 'Necesitas comprar créditos para usar las herramientas de IA.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Purchase Section */}
        <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-950/30 via-amber-900/20 to-amber-950/30 p-8 shadow-[0_0_60px_rgba(250,204,21,0.3)] backdrop-blur-xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-amber-200 mb-2">
              Comprar Créditos
            </h2>
            <p className="text-sm text-zinc-300">
              500 créditos por $39 - Cada generación consume 1 crédito
            </p>
          </div>

          <button
            onClick={handlePurchase}
            className="w-full rounded-xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/30 via-amber-500/25 to-amber-500/30 px-8 py-5 font-bold text-lg text-amber-50 shadow-[0_0_40px_rgba(250,204,21,0.4)] transition-all hover:from-amber-500/40 hover:via-amber-500/35 hover:to-amber-500/40 hover:shadow-[0_0_60px_rgba(250,204,21,0.5)] hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="flex items-center justify-center gap-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Buy 500 Credits</span>
            </span>
          </button>
        </div>

        {/* Information Section */}
        <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <h3 className="mb-4 text-lg font-bold text-amber-300">Información sobre Créditos</h3>
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex items-start gap-3">
              <span className="mt-1 text-amber-400">•</span>
              <span>Cada generación de contenido consume 1 crédito.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 text-amber-400">•</span>
              <span>Los créditos se agregan automáticamente después de una compra exitosa.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 text-amber-400">•</span>
              <span>El balance de créditos se actualiza en tiempo real.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 text-amber-400">•</span>
              <span>Si te quedas sin créditos, podrás comprar más en cualquier momento.</span>
            </li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
