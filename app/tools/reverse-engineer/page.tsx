'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

type AnalysisType = 'psychological' | 'storytelling' | 'production' | null;

// Helper to format Gemini text into simple HTML
function formatGeminiText(text: string): string {
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
  const [url, setUrl] = useState('');
  const [selectedType, setSelectedType] = useState<AnalysisType>(null);
  const [productService, setProductService] = useState('');
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!url || !selectedType) {
      setError('Please paste a valid ad URL and choose a focus before analyzing.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      // Convert product image to base64 if provided
      let productImageBase64 = null;
      if (productImage) {
        productImageBase64 = await fileToBase64(productImage);
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          type: selectedType,
          productService: selectedType === 'production' ? productService.trim() : undefined,
          productImage: selectedType === 'production' ? productImageBase64 : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.details || 'Failed to analyze the ad';
        const fullError = data.details ? `${errorMessage}: ${data.details}` : errorMessage;
        throw new Error(fullError);
      }

      setResult(data);
    } catch (error: any) {
      console.error('Error analyzing ad:', error);
      const errorMessage = error.message || 'Failed to analyze the ad';
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isValidUrl = (string: string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const canAnalyze = url.trim() !== '' && selectedType !== null && isValidUrl(url);

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
          Paste a Facebook Ad Library URL and let the system break down the psychology, narrative and production craft behind the creative.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-10">
        {/* URL Input */}
        <div className="mb-8">
          <label
            htmlFor="url"
            className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
          >
            Ad URL (Facebook Ad Library)
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/?id=869163755461256"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500 transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:ring-offset-2 focus:ring-offset-black"
          />
        </div>

        {/* Analysis Type Buttons */}
        <div className="mb-8">
          <label className="mb-3 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
            Analysis focus
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => setSelectedType('psychological')}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                selectedType === 'psychological'
                  ? 'border-amber-400/80 bg-amber-400 text-zinc-950 shadow-[0_0_30px_rgba(250,204,21,0.35)]'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900'
              }`}
            >
              Psychological
            </button>
            <button
              onClick={() => setSelectedType('storytelling')}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                selectedType === 'storytelling'
                  ? 'border-amber-400/80 bg-amber-400 text-zinc-950 shadow-[0_0_30px_rgba(250,204,21,0.35)]'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900'
              }`}
            >
              Storytelling
            </button>
            <button
              onClick={() => setSelectedType('production')}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                selectedType === 'production'
                  ? 'border-amber-400/80 bg-amber-400 text-zinc-950 shadow-[0_0_30px_rgba(250,204,21,0.35)]'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900'
              }`}
            >
              Production
            </button>
          </div>
        </div>

        {/* Product/Service Input - Only shown when Production is selected */}
        {selectedType === 'production' && (
          <div className="mb-8 space-y-4">
            <div>
              <label
                htmlFor="productService"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
              >
                Describe your product or service
              </label>
              <input
                id="productService"
                type="text"
                value={productService}
                onChange={(e) => setProductService(e.target.value)}
                placeholder="e.g., earplugs that lets you control the noises in the street"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500 transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:ring-offset-2 focus:ring-offset-black"
              />
            </div>
            
            <div>
              <label
                htmlFor="productImage"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
              >
                Product/Service Image (Optional)
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6 text-center hover:border-amber-500/40 transition-colors">
                    {productImagePreview ? (
                      <img
                        src={productImagePreview}
                        alt="Product preview"
                        className="max-h-32 mx-auto rounded-lg"
                      />
                    ) : (
                      <div className="text-zinc-500">
                        <svg
                          className="mx-auto h-10 w-10 mb-2"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <p className="text-xs">Click to upload product image</p>
                      </div>
                    )}
                  </div>
                  <input
                    id="productImage"
                    type="file"
                    accept="image/*"
                    onChange={handleProductImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Upload an image of your product/service to make the adapted prompt more accurate and faithful to your product.
              </p>
            </div>
          </div>
        )}

        {/* Analyze Button */}
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || isAnalyzing}
          className={`w-full rounded-lg px-6 py-4 text-base font-semibold text-white transition-all ${
            canAnalyze && !isAnalyzing
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
            'Analyze ad'
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-500/50 bg-red-950/30 p-4">
            <p className="text-sm font-medium text-red-200">
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Show Adapted Prompt if available, otherwise show original */}
            {result.adaptedPrompt ? (
              // Adapted Prompt (when productService is provided)
              <div className="rounded-2xl border border-emerald-500/60 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 shadow-[0_0_45px_rgba(16,185,129,0.22)]">
                <div className="mb-3 flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-emerald-300"
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
                    Adapted Production Prompt
                  </h3>
                </div>
                <div className="mb-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 px-4 py-2">
                  <p className="text-xs font-medium text-emerald-300">
                    Product/Service: <span className="text-emerald-200">{productService}</span>
                  </p>
                </div>
                <div className="prose prose-sm max-w-none text-zinc-200/90">
                  <div
                    className="rounded-xl bg-zinc-950/80 p-6 text-sm leading-relaxed shadow-inner ring-1 ring-emerald-100/5"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                    }}
                  >
                    <p className="mb-3 leading-relaxed">{result.adaptedPrompt}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(result.adaptedPrompt);
                    setCopied(true);
                    setTimeout(() => {
                      setCopied(false);
                    }, 3000);
                  }}
                  className="mt-4 rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>
            ) : (
              // Original Prompt (when no productService provided)
              result.geminiAnalysis && (
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
                      {result.type === 'production' ? 'Production Prompt' : 'AI breakdown (Gemini)'}
                    </h3>
                  </div>
                  <div className="prose prose-sm max-w-none text-zinc-200/90">
                    <div
                      className="rounded-xl bg-zinc-950/80 p-6 text-sm leading-relaxed shadow-inner ring-1 ring-amber-100/5"
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                      }}
                      dangerouslySetInnerHTML={{
                        __html: result.type === 'production' 
                          ? `<p class="mb-3 leading-relaxed">${result.geminiAnalysis.text.replace(/\n/g, '<br />')}</p>`
                          : formatGeminiText(result.geminiAnalysis.text),
                      }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

