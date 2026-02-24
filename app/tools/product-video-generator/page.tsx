'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

interface GeneratedPrompts {
  nanoBananaPrompt: string;
  videoPrompt: string;
}

export default function ProductVideoGenerator() {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [actionDescription, setActionDescription] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompts | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleGenerate = async () => {
    if (!productImage || !actionDescription.trim()) {
      setError('Please upload a product image and describe what should happen in the video');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedPrompts(null);

    try {
      const productBase64 = await fileToBase64(productImage);

      const response = await fetch('/api/generate-product-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productImage: productBase64,
          actionDescription: actionDescription.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to generate prompts');
      }

      setGeneratedPrompts({
        nanoBananaPrompt: data.nanoBananaPrompt || '',
        videoPrompt: data.videoPrompt || '',
      });
    } catch (error: any) {
      console.error('Error generating prompts:', error);
      setError(error.message || 'Failed to generate prompts. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 3000);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-zinc-50 mb-2">Product Video Animator</h1>
            <p className="text-sm text-zinc-400">
              Generate professional product video animation prompts for Nano Banana Pro and video generation
            </p>
          </div>

          <div className="space-y-6">
            {/* Product Image Upload */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Product Image (as clean as possible)
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6 text-center hover:border-amber-500/40 transition-colors">
                    {productPreview ? (
                      <img
                        src={productPreview}
                        alt="Product preview"
                        className="max-h-48 mx-auto rounded-lg"
                      />
                    ) : (
                      <div className="text-zinc-500">
                        <svg
                          className="mx-auto h-12 w-12 mb-2"
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
                        <p className="text-sm">Click to upload product image</p>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProductUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Action Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                What should happen in the video?
              </label>
              <textarea
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
                placeholder="Example: The product falls gracefully, rotates in slow motion, and lands softly on a surface"
                className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                rows={4}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !productImage || !actionDescription.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-6 py-3.5 font-semibold text-zinc-900 shadow-lg shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isGenerating ? 'Generating Prompts...' : 'Generate Prompts'}
            </button>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Generated Prompts */}
        {generatedPrompts && (
          <div className="space-y-6">
            {/* Nano Banana Prompt */}
            <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-50">
                  Nano Banana Pro Prompt
                </h2>
                <button
                  onClick={() => copyToClipboard(generatedPrompts.nanoBananaPrompt, 'nano-banana')}
                  className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
                >
                  {copiedId === 'nano-banana' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                  {generatedPrompts.nanoBananaPrompt}
                </p>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Use this prompt in Nano Banana Pro to generate a reference image that will be used for video animation
              </p>
            </div>

            {/* Video Prompt */}
            <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-50">
                  Video Animation Prompt
                </h2>
                <button
                  onClick={() => copyToClipboard(generatedPrompts.videoPrompt, 'video-prompt')}
                  className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
                >
                  {copiedId === 'video-prompt' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                  {generatedPrompts.videoPrompt}
                </p>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Use this detailed prompt for video generation. It includes all physical movements, cinematography, and studio-quality details.
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
