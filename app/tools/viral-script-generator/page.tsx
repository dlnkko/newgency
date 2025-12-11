'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

interface ViralScript {
  hook: string;
  promise: string;
  body: string;
  payoff: string;
}

export default function ViralScriptGenerator() {
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [duration, setDuration] = useState<number>(15);
  const [generatedScript, setGeneratedScript] = useState<ViralScript | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!videoPrompt.trim()) {
      setError('Please enter a video prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedScript(null);

    try {
      const response = await fetch('/api/generate-viral-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPrompt,
          duration,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
        } else {
          setError(data.error || 'Failed to generate viral script');
        }
        return;
      }

      setGeneratedScript(data.script);
    } catch (err) {
      setError('An error occurred while generating the script');
      console.error('Error generating viral script:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, sectionId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(sectionId);
      setTimeout(() => setCopiedId(null), 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyFullScript = () => {
    if (!generatedScript) return;
    const fullScript = `HOOK:\n${generatedScript.hook}\n\nPROMISE:\n${generatedScript.promise}\n\nBODY:\n${generatedScript.body}\n\nPAYOFF:\n${generatedScript.payoff}`;
    copyToClipboard(fullScript, 'full');
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50 sm:text-4xl">
            Viral Script Generator
          </h1>
          <p className="text-sm text-zinc-400 sm:text-base">
            Generate viral UGC marketing scripts that convert. Create compelling hooks, promises, and payoffs designed to make users want to buy your product.
          </p>
        </div>

        {/* Video Prompt Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Video Prompt
          </label>
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder="Describe what happens in your video... (e.g., 'A person unboxes a new skincare product, shows before/after results, demonstrates the product in use')"
            rows={6}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Duration Selection */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Video Duration (seconds)
          </label>
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
            {Array.from({ length: 15 }, (_, i) => i + 1).map((seconds) => {
              const isSelected = duration === seconds;
              const isDefault = seconds === 1;
              return (
                <button
                  key={seconds}
                  onClick={() => setDuration(seconds)}
                  disabled={isGenerating}
                  className={`group relative rounded-lg border-2 transition-all duration-200 ${
                    isDefault
                      ? `col-span-2 sm:col-span-1 px-4 sm:px-4 py-3 sm:py-3 text-xs sm:text-sm font-bold ${isSelected ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30' : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_8px_rgba(250,204,21,0.1)]'}`
                      : `px-3 py-2 text-xs font-semibold ${isSelected ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30' : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_8px_rgba(250,204,21,0.1)]'}`
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="relative z-10">{isDefault ? 'Default' : `${seconds}s`}</span>
                  {isSelected && !isDefault && (
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-amber-400 text-[10px]">✓</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {duration === 1 
              ? 'Default selected - AI will optimize script length automatically.'
              : `${duration} seconds selected - AI will create a script optimized for this duration.`}
          </p>
        </div>

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !videoPrompt.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isGenerating ? 'Generating Viral Script...' : 'Generate Viral Script'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Generated Script */}
        {generatedScript && (
          <div className="space-y-6">
            {/* Full Script Copy Button */}
            <div className="flex justify-end">
              <button
                onClick={copyFullScript}
                className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition-all hover:border-amber-500/70 hover:bg-amber-500/20"
              >
                {copiedId === 'full' ? 'Copied!' : 'Copy Full Script'}
              </button>
            </div>

            {/* Hook Section */}
            <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold uppercase tracking-wide text-amber-400">
                  🎣 Hook
                </h3>
                <button
                  onClick={() => copyToClipboard(generatedScript.hook, 'hook')}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 transition-all hover:bg-amber-500/20"
                >
                  {copiedId === 'hook' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                {generatedScript.hook}
              </p>
              <p className="mt-3 text-xs italic text-zinc-400">
                The opening line that stops the scroll. Bold, emotional, and impossible to ignore.
              </p>
            </div>

            {/* Promise Section */}
            <div className="rounded-2xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold uppercase tracking-wide text-blue-400">
                  ⚡ Promise
                </h3>
                <button
                  onClick={() => copyToClipboard(generatedScript.promise, 'promise')}
                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200 transition-all hover:bg-blue-500/20"
                >
                  {copiedId === 'promise' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                {generatedScript.promise}
              </p>
              <p className="mt-3 text-xs italic text-zinc-400">
                The high-stakes promise or challenge that keeps viewers watching to see if it delivers.
              </p>
            </div>

            {/* Body Section */}
            <div className="rounded-2xl border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-6 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold uppercase tracking-wide text-purple-400">
                  📦 Body
                </h3>
                <button
                  onClick={() => copyToClipboard(generatedScript.body, 'body')}
                  className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200 transition-all hover:bg-purple-500/20"
                >
                  {copiedId === 'body' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                {generatedScript.body}
              </p>
              <p className="mt-3 text-xs italic text-zinc-400">
                Quick, engaging content about the product that builds desire and showcases value.
              </p>
            </div>

            {/* Payoff Section */}
            <div className="rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5 p-6 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-bold uppercase tracking-wide text-green-400">
                  🎯 Payoff
                </h3>
                <button
                  onClick={() => copyToClipboard(generatedScript.payoff, 'payoff')}
                  className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-200 transition-all hover:bg-green-500/20"
                >
                  {copiedId === 'payoff' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                {generatedScript.payoff}
              </p>
              <p className="mt-3 text-xs italic text-zinc-400">
                The satisfying conclusion that delivers on the promise and drives the purchase decision.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

