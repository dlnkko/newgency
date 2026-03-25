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
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);
  const [productDescription, setProductDescription] = useState('');
  const [avatarDescription, setAvatarDescription] = useState('');
  const [creativeAngle, setCreativeAngle] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [generatedScript, setGeneratedScript] = useState('');
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isIteratingScript, setIsIteratingScript] = useState(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file.');
        return;
      }
      setUploadedVideo(file);
      setError(null);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeVideo = () => {
    setUploadedVideo(null);
    setVideoPreview(null);
  };

  const handleGenerate = async () => {
    if (!metaAdUrl.trim() && !socialMediaUrl.trim() && !uploadedVideo) {
      setError('Please provide either a Meta Ad URL, Instagram/TikTok URL, or upload a video file.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setIsInsufficientCredits(false);
    setResult(null);

    try {
      const hasUploadedVideo = !!uploadedVideo;
      const response = await fetch('/api/analyze', hasUploadedVideo
        ? (() => {
            const form = new FormData();
            if (metaAdUrl.trim()) form.append('metaAdUrl', metaAdUrl.trim());
            if (socialMediaUrl.trim()) form.append('socialMediaUrl', socialMediaUrl.trim());
            form.append('video', uploadedVideo as File);
            return { method: 'POST', body: form } as RequestInit;
          })()
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              metaAdUrl: metaAdUrl.trim() || undefined,
              socialMediaUrl: socialMediaUrl.trim() || undefined,
            }),
          });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) {
          throw new Error(rawText || `Error ${response.status}: ${response.statusText}`);
        }
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setIsAnalyzing(false);
          return;
        }
        if (response.status === 413 || (typeof rawText === 'string' && rawText.includes('Entity Too Large'))) {
          throw new Error('El video es demasiado grande para subirlo. Prueba con un video más corto/liviano (o comprimido).');
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

  const handleGenerateScript = async () => {
    if (!result) {
      setScriptError('Genera primero el análisis.');
      return;
    }
    if (!productDescription.trim()) {
      setScriptError('Describe el producto para generar el script.');
      return;
    }
    if (!avatarDescription.trim()) {
      setScriptError('Describe el avatar/personaje para generar el script.');
      return;
    }

    setIsGeneratingScript(true);
    setScriptError(null);
    setIsInsufficientCredits(false);

    try {
      let videoBase64: string | null = null;
      if (uploadedVideo) {
        videoBase64 = await fileToBase64(uploadedVideo);
      }

      const response = await fetch('/api/generate-viral-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: socialMediaUrl.trim() || null,
          metaAdUrl: metaAdUrl.trim() || null,
          video: videoBase64,
          productDescription: productDescription.trim(),
          avatarDescription: avatarDescription.trim(),
          creativeAngle: creativeAngle.trim() || null,
          duration,
        }),
      });

      const rawText = await response.text();
      let data: { script?: string; generatedScript?: string; result?: string; error?: string; details?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) {
          setScriptError(rawText || `Error ${response.status}: ${response.statusText}`);
        } else {
          setScriptError('Respuesta inválida del servidor al generar script.');
        }
        return;
      }

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setScriptError(null);
        } else {
          setScriptError(data.error || data.details || 'No se pudo generar el script.');
        }
        return;
      }

      const resolvedScript =
        (typeof data.script === 'string' && data.script) ||
        (typeof data.generatedScript === 'string' && data.generatedScript) ||
        (typeof data.result === 'string' && data.result) ||
        '';
      setGeneratedScript(resolvedScript.trim());
    } catch (err: any) {
      setScriptError(err?.message || 'Error al generar script desde reverse engineer.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleIterateScript = async () => {
    if (!generatedScript.trim()) {
      setScriptError('No hay script para iterar. Genera uno primero.');
      return;
    }
    if (!duration || ![15, 30, 45, 60].includes(duration)) {
      setScriptError('Selecciona una duración válida (15, 30, 45 o 60).');
      return;
    }
    if (!productDescription.trim() || !avatarDescription.trim()) {
      setScriptError('Completa Product y Avatar para iterar.');
      return;
    }

    setIsIteratingScript(true);
    setScriptError(null);
    setIsInsufficientCredits(false);

    try {
      const response = await fetch('/api/adapt-viral-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalScript: generatedScript,
          duration,
          productDescription: productDescription.trim(),
          avatarDescription: avatarDescription.trim(),
          creativeAngle: creativeAngle.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setScriptError(null);
        } else {
          setScriptError(data.error || data.details || 'No se pudo iterar el script.');
        }
        return;
      }

      const iteratedScript =
        (typeof data.script === 'string' && data.script) ||
        (typeof data.generatedScript === 'string' && data.generatedScript) ||
        (typeof data.result === 'string' && data.result) ||
        '';
      setGeneratedScript(iteratedScript.trim());
    } catch (err: any) {
      setScriptError(err?.message || 'Error al iterar el script.');
    } finally {
      setIsIteratingScript(false);
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
    isValidUrl(metaAdUrl) || 
    (isValidUrl(socialMediaUrl) && (isInstagram || isTikTok)) ||
    uploadedVideo !== null;

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
          Paste a Meta Ad URL or Instagram/TikTok URL, or upload a video file directly, and get deep psychological insights about why the video worked, what connected with the audience, and what you can replicate.
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

        {/* Video Upload */}
        <div className="mb-6">
          <label
            htmlFor="videoUpload"
            className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400"
          >
            Upload Video (Optional)
          </label>
          {!videoPreview ? (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-6 py-8 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
              <svg
                className="mb-3 h-10 w-10 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm font-medium text-zinc-400">
                Click to upload or drag and drop
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                MP4, MOV, AVI up to 100MB
              </span>
              <input
                id="videoUpload"
                type="file"
                accept="video/mp4,video/mov,video/avi,video/quicktime"
                onChange={handleVideoUpload}
                className="hidden"
                disabled={isAnalyzing}
              />
            </label>
          ) : (
            <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
              <div className="relative inline-block">
                <video
                  src={videoPreview}
                  controls
                  className="max-h-64 rounded-lg"
                />
                <button
                  onClick={removeVideo}
                  disabled={isAnalyzing}
                  className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove video"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
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

            {/* Script Actions (inside Reverse Engineer) */}
            <div className="rounded-2xl border border-blue-500/40 bg-zinc-950/70 p-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <h3 className="mb-4 text-lg font-semibold text-blue-200">
                Script Builder (desde este Reverse Engineer)
              </h3>

              <div className="space-y-4">
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Product: ¿qué producto vendes?"
                  rows={3}
                  disabled={isGeneratingScript || isIteratingScript}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />

                <textarea
                  value={avatarDescription}
                  onChange={(e) => setAvatarDescription(e.target.value)}
                  placeholder="Avatar: ¿quién lo dice y con qué tono?"
                  rows={3}
                  disabled={isGeneratingScript || isIteratingScript}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />

                <textarea
                  value={creativeAngle}
                  onChange={(e) => setCreativeAngle(e.target.value)}
                  placeholder="Creative angle (opcional)"
                  rows={2}
                  disabled={isGeneratingScript || isIteratingScript}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />

                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map((seconds) => (
                    <button
                      key={seconds}
                      onClick={() => setDuration(duration === seconds ? null : seconds)}
                      disabled={isGeneratingScript || isIteratingScript}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        duration === seconds
                          ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                          : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-blue-500/50'
                      }`}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript || isIteratingScript || !productDescription.trim() || !avatarDescription.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGeneratingScript ? 'Generating script...' : 'Generate Script'}
                  </button>
                  <button
                    onClick={handleIterateScript}
                    disabled={isGeneratingScript || isIteratingScript || !generatedScript.trim() || !duration}
                    className="rounded-lg border border-blue-400/50 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isIteratingScript ? 'Iterating...' : 'Iterate Script'}
                  </button>
                  {generatedScript.trim() && (
                    <CopyButton
                      text={generatedScript}
                      label="Copy Script"
                      copiedLabel="Copied!"
                    />
                  )}
                </div>

                {scriptError && (
                  <p className="text-sm text-red-300">{scriptError}</p>
                )}

                {generatedScript.trim() && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
                    <p className="text-sm leading-relaxed text-zinc-100">{generatedScript}</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

