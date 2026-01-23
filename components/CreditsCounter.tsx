'use client';

import { useState, useEffect, useCallback } from 'react';

interface CreditsCounterProps {
  className?: string;
  whopPurchaseUrl?: string;
}

const CREDITS_CACHE_KEY = 'user_credits_cache';
const CREDITS_CACHE_TIMESTAMP_KEY = 'user_credits_cache_timestamp';
const CACHE_DURATION = 30000; // 30 seconds

export default function CreditsCounter({ className = '' }: CreditsCounterProps) {
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCredits = useCallback(async () => {
    try {
      const response = await fetch('/api/user/credits');
      const data = await response.json();

      if (response.ok && data.success) {
        const creditsValue = data.credits || 0;
        setCredits(creditsValue);
        // Cache the value
        sessionStorage.setItem(CREDITS_CACHE_KEY, creditsValue.toString());
        sessionStorage.setItem(CREDITS_CACHE_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch (error) {
      console.error('Error loading credits:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Try to load from cache first
    const cachedCredits = sessionStorage.getItem(CREDITS_CACHE_KEY);
    const cachedTimestamp = sessionStorage.getItem(CREDITS_CACHE_TIMESTAMP_KEY);
    
    let shouldLoadImmediately = true;
    
    if (cachedCredits !== null && cachedTimestamp !== null) {
      const timestamp = parseInt(cachedTimestamp, 10);
      const now = Date.now();
      const cachedValue = parseInt(cachedCredits, 10);
      
      // If cache is still valid, use it immediately
      if (now - timestamp < CACHE_DURATION) {
        setCredits(cachedValue);
        setIsLoading(false);
        shouldLoadImmediately = false;
        
        // If credits are 0, don't reload immediately - just set up interval for later
        if (cachedValue === 0) {
          const interval = setInterval(() => {
            // Only reload if cache is expired
            const currentTimestamp = sessionStorage.getItem(CREDITS_CACHE_TIMESTAMP_KEY);
            if (currentTimestamp) {
              const currentTime = parseInt(currentTimestamp, 10);
              if (Date.now() - currentTime >= CACHE_DURATION) {
                loadCredits();
              }
            }
          }, CACHE_DURATION);
          
          // Listen for credit updates
          const handleCreditUpdate = () => {
            sessionStorage.removeItem(CREDITS_CACHE_KEY);
            sessionStorage.removeItem(CREDITS_CACHE_TIMESTAMP_KEY);
            loadCredits();
          };
          
          window.addEventListener('creditsUpdated', handleCreditUpdate);
          
          return () => {
            clearInterval(interval);
            window.removeEventListener('creditsUpdated', handleCreditUpdate);
          };
        }
      }
    }
    
    // Load credits if no cache or cache expired
    if (shouldLoadImmediately) {
      loadCredits();
    }
    
    // Set up interval to reload credits periodically
    const interval = setInterval(() => {
      loadCredits();
    }, CACHE_DURATION);
    
    // Listen for credit updates (when credits are consumed or purchased)
    const handleCreditUpdate = () => {
      // Invalidate cache and reload
      sessionStorage.removeItem(CREDITS_CACHE_KEY);
      sessionStorage.removeItem(CREDITS_CACHE_TIMESTAMP_KEY);
      loadCredits();
    };
    
    window.addEventListener('creditsUpdated', handleCreditUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('creditsUpdated', handleCreditUpdate);
    };
  }, [loadCredits]);

  const handlePurchase = () => {
    // Get purchase URL from client environment variable
    const purchaseUrl = process.env.NEXT_PUBLIC_WHOP_PURCHASE_URL;
    if (purchaseUrl) {
      window.open(purchaseUrl, '_blank');
    } else {
      alert('Purchase URL not configured. Please contact the administrator.');
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

  if (credits === null) {
    return null;
  }

  const hasCredits = credits > 0;
  const isLow = credits < 10;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Credits counter */}
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
            {credits} credit{credits !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Purchase button - Always visible and prominent */}
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

