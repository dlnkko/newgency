'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

export default function ViralScriptGenerator() {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [productDescription, setProductDescription] = useState<string>('');
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);

  const handleGenerate = async () => {
    if (!videoUrl.trim()) {
      setError('Please enter a video URL (Instagram Reel or TikTok)');
      return;
    }

    if (!productDescription.trim()) {
      setError('Please describe your product');
      return;
    }

    setIsGenerating(true);
    setIsScraping(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeneratedScript('');

    try {
      const response = await fetch('/api/generate-viral-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl,
          productDescription,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
        } else if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
          setIsInsufficientCredits(false);
        } else {
          setError(data.error || 'Failed to generate viral script');
          setIsInsufficientCredits(false);
        }
        return;
      }

      setGeneratedScript(data.script);
    } catch (err) {
      setError('An error occurred while generating the script');
      console.error('Error generating viral script:', err);
    } finally {
      setIsGenerating(false);
      setIsScraping(false);
    }
  };

  // Detect platform from URL
  const isInstagram = videoUrl.includes('instagram.com/reel') || videoUrl.includes('instagram.com/p/');
  const isTikTok = videoUrl.includes('tiktok.com');

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50 sm:text-4xl">
            Viral Script Generator
          </h1>
          <p className="text-sm text-zinc-400 sm:text-base">
            Paste a viral Instagram Reel or TikTok URL, describe your product, and get a converted script that maintains the same storytelling, format, and style but focused on your product.
          </p>
        </div>

        {/* Video URL Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Instagram Reel or TikTok URL
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/... or https://www.tiktok.com/..."
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {videoUrl && (
            <p className="mt-2 text-xs text-zinc-500">
              {isInstagram && '✓ Instagram Reel detected'}
              {isTikTok && '✓ TikTok video detected'}
              {!isInstagram && !isTikTok && videoUrl && '⚠ Please enter a valid Instagram Reel or TikTok URL'}
            </p>
          )}
        </div>

        {/* Product Description Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Describe Your Product
          </label>
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="Describe your product in detail... (e.g., 'A revolutionary skincare serum with hyaluronic acid that reduces fine lines in 7 days, comes in a premium glass bottle with dropper')"
            rows={6}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !videoUrl.trim() || !productDescription.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isScraping ? 'Scraping video transcript...' : isGenerating ? 'Generating viral script...' : 'Generate Viral Script'}
          </button>
        </div>

        {/* Insufficient Credits Error */}
        {isInsufficientCredits && (
          <div className="mb-6">
            <InsufficientCreditsError />
          </div>
        )}

        {/* Error Message */}
        {error && !isInsufficientCredits && (
          <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Generated Script */}
        {generatedScript && (
          <div className="space-y-4">
            {/* Copy Button */}
            <div className="flex justify-end">
              <CopyButton 
                text={generatedScript} 
                label="Copy Script"
                copiedLabel="Copied!"
              />
            </div>

            {/* Script Display */}
            <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]">
              <h3 className="mb-4 text-lg font-bold uppercase tracking-wide text-amber-400">
                Your Viral Script
              </h3>
              <div className="prose prose-invert max-w-none">
                <p className="text-sm leading-relaxed text-zinc-100">
                  {generatedScript}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
