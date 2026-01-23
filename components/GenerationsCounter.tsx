'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface GenerationsCounterProps {
  className?: string;
}

export default function GenerationsCounter({ className = '' }: GenerationsCounterProps) {
  const [generations, setGenerations] = useState<{
    used: number;
    limit: number;
    remaining: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    loadGenerations();
  }, []);

  const loadGenerations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/generations');
      const data = await response.json();

      if (response.ok && data.success) {
        setGenerations({
          used: data.used || 0,
          limit: data.limit || 500,
          remaining: data.remaining || 500
        });
      }
    } catch (error) {
      console.error('Error loading generations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (isPurchasing) return;

    const confirmed = window.confirm(
      '¿Comprar 500 generaciones adicionales por $30?'
    );

    if (!confirmed) return;

    setIsPurchasing(true);

    try {
      const response = await fetch('/api/user/purchase-generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: 500 }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`¡Éxito! Se agregaron 500 generaciones a tu cuenta.`);
        await loadGenerations(); // Recargar el contador
      } else {
        alert(data.error || 'Error al procesar la compra');
      }
    } catch (error: any) {
      console.error('Error purchasing generations:', error);
      alert('Error al procesar la compra. Por favor, intenta de nuevo.');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></div>
        <span className="text-xs text-zinc-400">Loading...</span>
      </div>
    );
  }

  if (!generations) {
    return null;
  }

  const percentage = (generations.used / generations.limit) * 100;
  const isLow = generations.remaining < 50;
  const isEmpty = generations.remaining === 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Contador de generaciones */}
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 ${isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-green-400'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span className="text-xs font-medium text-zinc-300">
            <span className={isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-green-400'}>
              {generations.remaining}
            </span>
            {' / '}
            <span className="text-zinc-400">{generations.limit}</span>
          </span>
        </div>
        {/* Barra de progreso */}
        <div className="h-1.5 w-16 rounded-full bg-zinc-800/50 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isEmpty
                ? 'bg-red-500'
                : isLow
                ? 'bg-amber-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      </div>

      {/* Botón de compra */}
      {isEmpty && (
        <button
          onClick={handlePurchase}
          disabled={isPurchasing}
          className="rounded-lg border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/20 to-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.25)] transition-all hover:from-amber-500/30 hover:to-amber-500/20 hover:shadow-[0_0_20px_rgba(250,204,21,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPurchasing ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
              Procesando...
            </span>
          ) : (
            'Comprar 500 más ($30)'
          )}
        </button>
      )}

      {isLow && !isEmpty && (
        <button
          onClick={handlePurchase}
          disabled={isPurchasing}
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPurchasing ? '...' : 'Comprar más'}
        </button>
      )}
    </div>
  );
}


