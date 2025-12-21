'use client';

import { useState } from 'react';

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export default function CopyButton({ 
  text, 
  label = 'Copy', 
  copiedLabel = 'Copied!',
  className = ''
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-all hover:border-amber-500/70 hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(250,204,21,0.2)] ${className}`}
    >
      <span>📋</span>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

