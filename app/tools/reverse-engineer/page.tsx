'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

// Helper to format analysis text into simple HTML
function formatAnalysisText(text: string): string {
  if (!text) return '';
  
  // Escapar HTML primero
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Procesar línea por línea
  const lines = formatted.split('\n');
  const blocks: string[] = [];
  let currentList: string[] = [];
  let currentListType: 'ul' | 'ol' | null = null;
  
  const flushList = () => {
    if (currentList.length > 0 && currentListType) {
      const tag = currentListType;
      blocks.push(`<${tag} class="my-3 ml-6 space-y-1 list-disc">${currentList.join('')}</${tag}>`);
      currentList = [];
      currentListType = null;
    }
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Títulos - usar blanco para mejor visibilidad en fondo negro
    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push(`<h3 class="mt-4 mb-2 text-base font-semibold text-white">${trimmed.substring(4)}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(`<h2 class="mt-5 mb-3 text-lg font-bold text-white">${trimmed.substring(3)}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(`<h1 class="mt-6 mb-4 text-xl font-bold text-white">${trimmed.substring(2)}</h1>`);
      continue;
    }
    
    // Listas con viñetas
    const bulletMatch = trimmed.match(/^[\*\-\+]\s+(.+)$/);
    if (bulletMatch) {
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      currentList.push(`<li class="ml-4">${bulletMatch[1]}</li>`);
      continue;
    }
    
    // Listas numeradas
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      currentList.push(`<li class="ml-4">${numberedMatch[1]}</li>`);
      continue;
    }
    
    // Línea vacía
    if (!trimmed) {
      flushList();
      blocks.push('');
      continue;
    }
    
    // Línea normal
    flushList();
    blocks.push(trimmed);
  }
  
  flushList();
  
  // Unir bloques y procesar formato inline
  formatted = blocks.join('\n');
  
  // Negritas - usar blanco para mejor visibilidad en fondo negro
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<strong class="font-semibold text-white">$1</strong>');
  
  // Cursivas (evitar conflictos con negritas)
  formatted = formatted.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em class="italic">$1</em>');
  
  // Dividir en párrafos
  const paragraphs = formatted.split('\n\n');
  formatted = paragraphs.map(block => {
    block = block.trim();
    if (!block) return '';
    // Si ya es HTML, no envolver
    if (block.match(/^<(h[1-6]|ul|ol|li)/)) {
      return block;
    }
    // Convertir saltos de línea simples a <br>
    block = block.replace(/\n/g, '<br />');
    return `<p class="mb-3 leading-relaxed">${block}</p>`;
  }).join('');
  
  return formatted;
}

export default function ReverseEngineer() {
  const [metaAdUrl, setMetaAdUrl] = useState('');
  const [socialMediaUrl, setSocialMediaUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);

  const handleGenerate = async () => {
    if (!metaAdUrl.trim() && !socialMediaUrl.trim()) {
      setError('Please provide either a Meta Ad URL or Instagram/TikTok URL.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setIsInsufficientCredits(false);
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metaAdUrl: metaAdUrl.trim() || undefined,
          socialMediaUrl: socialMediaUrl.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setIsAnalyzing(false);
          return;
        }
        const errorMessage = data.error || data.details || 'Failed to analyze the content';
        const fullError = data.details ? `${errorMessage}: ${data.details}` : errorMessage;
        throw new Error(fullError);
      }

      setResult(data);
    } catch (error: any) {
      console.error('Error analyzing content:', error);
      const errorMessage = error.message || 'Failed to analyze the content';
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isValidUrl = (string: string) => {
    if (!string.trim()) return false;
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const isInstagram = socialMediaUrl.includes('instagram.com/reel') || socialMediaUrl.includes('instagram.com/p/');
  const isTikTok = socialMediaUrl.includes('tiktok.com');
  const isMetaAd = metaAdUrl.includes('facebook.com/ads/library');

  const canGenerate = 
    isValidUrl(metaAdUrl) || (isValidUrl(socialMediaUrl) && (isInstagram || isTikTok));

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
          Reverse-engineer any AD
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Deconstruct high‑performing ads like an innovation lab
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Paste a Meta Ad URL or Instagram/TikTok URL and get deep psychological insights about why the video worked, what connected with the audience, and what you can replicate.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-10">
        {/* Meta Ad URL Input */}
        <div className="mb-6">
          <label
            htmlFor="metaAdUrl"
            className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
          >
            Meta Ad URL (Optional)
          </label>
          <input
            id="metaAdUrl"
            type="url"
            value={metaAdUrl}
            onChange={(e) => setMetaAdUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?id=869163755461256"
            disabled={isAnalyzing}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500 transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {metaAdUrl && (
            <p className="mt-2 text-xs text-zinc-500">
              {isMetaAd ? '✓ Meta Ad URL detected' : '⚠ Please enter a valid Meta Ad Library URL'}
            </p>
          )}
        </div>

        {/* Social Media URL Input */}
        <div className="mb-6">
          <label
            htmlFor="socialMediaUrl"
            className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
          >
            Instagram or TikTok URL (Optional)
          </label>
          <input
            id="socialMediaUrl"
            type="url"
            value={socialMediaUrl}
            onChange={(e) => setSocialMediaUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/... or https://www.tiktok.com/..."
            disabled={isAnalyzing}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500 transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {socialMediaUrl && (
            <p className="mt-2 text-xs text-zinc-500">
              {isInstagram && '✓ Instagram Reel detected'}
              {isTikTok && '✓ TikTok video detected'}
              {!isInstagram && !isTikTok && socialMediaUrl && '⚠ Please enter a valid Instagram Reel or TikTok URL'}
            </p>
          )}
        </div>


        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isAnalyzing}
          className={`w-full rounded-lg px-6 py-4 text-base font-semibold text-white transition-all ${
            canGenerate && !isAnalyzing
              ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 shadow-[0_0_35px_rgba(250,204,21,0.4)] hover:brightness-110 active:scale-[0.98]'
              : 'cursor-not-allowed bg-zinc-700 text-zinc-400'
          }`}
        >
          {isAnalyzing ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Analyzing...
            </span>
          ) : (
            'Generate'
          )}
        </button>

        {/* Insufficient Credits Error */}
        {isInsufficientCredits && (
          <div className="mt-6">
            <InsufficientCreditsError />
          </div>
        )}

        {/* Error Message */}
        {error && !isInsufficientCredits && (
          <div className="mt-6 rounded-lg border border-red-500/50 bg-red-950/30 p-4">
            <p className="text-sm font-medium text-red-200">
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Insights Originales */}
            {result.insights && (
              <div className="rounded-2xl border border-amber-500/60 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 shadow-[0_0_45px_rgba(250,204,21,0.22)]">
                <div className="mb-3 flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-amber-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  <h3 className="text-xl font-semibold text-zinc-50">
                    Análisis Completo (Gemini)
                  </h3>
                </div>
                <div className="mb-4 flex justify-end">
                  <CopyButton 
                    text={result.insights} 
                    label="Copy Insights"
                    copiedLabel="Copied!"
                  />
                </div>
                <div className="prose prose-sm max-w-none text-zinc-200/90">
                  <div
                    className="rounded-xl bg-zinc-950/80 p-6 text-sm leading-relaxed shadow-inner ring-1 ring-amber-100/5"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: formatAnalysisText(result.insights),
                    }}
                  />
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

