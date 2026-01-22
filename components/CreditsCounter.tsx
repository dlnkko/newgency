'use client';

import { useState, useEffect } from 'react';

interface CreditsCounterProps {
  className?: string;
  whopPurchaseUrl?: string;
}

export default function CreditsCounter({ className = '' }: CreditsCounterProps) {
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
    // Obtener URL de compra desde variable de entorno del cliente
    const purchaseUrl = process.env.NEXT_PUBLIC_WHOP_PURCHASE_URL;
    if (purchaseUrl) {
      window.open(purchaseUrl, '_blank');
    } else {
      alert('URL de compra no configurada. Por favor, contacta al administrador.');
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></div>
        <span className="text-xs text-zinc-400">Cargando...</span>
      </div>
    );
  }

  if (credits === null) {
    return null;
  }

  const hasCredits = credits > 0;
  const isLow = credits < 10;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Contador de créditos */}
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
        hasCredits 
          ? 'border-zinc-800/50 bg-zinc-900/30' 
          : 'border-red-500/50 bg-red-950/20'
      }`}>
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 ${
              hasCredits 
                ? isLow 
                  ? 'text-amber-400' 
                  : 'text-green-400'
                : 'text-red-400'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className={`text-xs font-medium ${
            hasCredits 
              ? isLow 
                ? 'text-amber-300' 
                : 'text-green-300'
              : 'text-red-300'
          }`}>
            {credits} crédito{credits !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Botón de compra - Siempre visible y notorio */}
      <button
        onClick={handlePurchase}
        className={`rounded-lg border-2 font-bold text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all hover:shadow-[0_0_30px_rgba(250,204,21,0.4)] hover:scale-[1.05] active:scale-[0.95] ${
          !hasCredits
            ? 'border-amber-500/70 bg-gradient-to-r from-amber-500/30 to-amber-500/20 px-4 py-2 text-sm'
            : 'border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-amber-500/10 px-3 py-1.5 text-xs'
        }`}
      >
        {!hasCredits ? 'Buy 500 Credits' : 'Buy 500 Credits'}
      </button>
    </div>
  );
}

