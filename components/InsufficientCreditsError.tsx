'use client';

interface InsufficientCreditsErrorProps {
  className?: string;
}

export default function InsufficientCreditsError({ className = '' }: InsufficientCreditsErrorProps) {
  const handlePurchase = () => {
    const purchaseUrl = process.env.NEXT_PUBLIC_WHOP_PURCHASE_URL;
    if (purchaseUrl) {
      window.open(purchaseUrl, '_blank');
    } else {
      alert('Purchase URL not configured. Please contact the administrator.');
    }
  };

  return (
    <div className={`rounded-xl border-2 border-red-500/50 bg-red-500/10 p-6 ${className}`}>
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <svg
            className="h-5 w-5 text-red-400"
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
          <h3 className="text-base font-semibold text-red-200">
            Insufficient Credits
          </h3>
        </div>
        <p className="text-sm text-red-300/90">
          You don't have enough credits to perform this action. Please purchase more credits to continue generating.
        </p>
      </div>
      <button
        onClick={handlePurchase}
        className="w-full rounded-lg border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/30 via-amber-500/25 to-amber-500/30 px-6 py-3 font-bold text-amber-50 shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-500/40 hover:via-amber-500/35 hover:to-amber-500/40 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] hover:scale-[1.02] active:scale-[0.98]"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Buy More Credits</span>
        </span>
      </button>
    </div>
  );
}

