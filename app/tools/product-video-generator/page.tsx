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
  const [isUGC, setIsUGC] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [nanoBananaPrompt, setNanoBananaPrompt] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<File | null>(null);
  const [generatedImagePreview, setGeneratedImagePreview] = useState<string | null>(null);
  const [videoAnimationPrompt, setVideoAnimationPrompt] = useState<string | null>(null);
  const [isGeneratingAnimation, setIsGeneratingAnimation] = useState<boolean>(false);
  const [animationPrompt, setAnimationPrompt] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
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
    setNanoBananaPrompt(null);
    setVideoAnimationPrompt(null);
    setGeneratedImage(null);
    setGeneratedImagePreview(null);

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
          nanoBananaOnly: true, // Only generate Nano Banana prompt first
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to generate prompt');
      }

      setNanoBananaPrompt(data.nanoBananaPrompt || '');
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      setError(error.message || 'Failed to generate prompt. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratedImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGeneratedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneratedImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAnimation = async () => {
    if (!generatedImage || !actionDescription.trim()) {
      setError('Please upload the generated image and ensure you have an action description');
      return;
    }

    setIsGeneratingAnimation(true);
    setError(null);
    setVideoAnimationPrompt(null);

    try {
      const generatedImageBase64 = await fileToBase64(generatedImage);

      const response = await fetch('/api/generate-product-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productImage: generatedImageBase64,
          actionDescription: actionDescription.trim(),
          animateOnly: true, // Generate animation prompt based on uploaded generated image
          isUGC: isUGC,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to generate animation prompt');
      }

      setVideoAnimationPrompt(data.videoPrompt || '');
    } catch (error: any) {
      console.error('Error generating animation prompt:', error);
      setError(error.message || 'Failed to generate animation prompt. Please try again.');
    } finally {
      setIsGeneratingAnimation(false);
    }
  };

  const handleAnimateImage = async () => {
    if (!productImage || !actionDescription.trim()) {
      setError('Please upload a product image and describe what should happen in the video');
      return;
    }

    setIsAnimating(true);
    setError(null);
    setAnimationPrompt(null);

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
          animateOnly: true, // Flag to only generate animation prompt
          isUGC: isUGC,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to generate animation prompt');
      }

      setAnimationPrompt(data.videoPrompt || '');
    } catch (error: any) {
      console.error('Error generating animation prompt:', error);
      setError(error.message || 'Failed to generate animation prompt. Please try again.');
    } finally {
      setIsAnimating(false);
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
            <h1 className="text-2xl font-bold text-zinc-50 mb-2">Animator Tool</h1>
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

            {/* UGC Toggle */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={isUGC}
                    onChange={(e) => setIsUGC(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-14 h-7 rounded-full transition-colors ${
                      isUGC ? 'bg-amber-500' : 'bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform ${
                        isUGC ? 'translate-x-7' : 'translate-x-1'
                      } mt-0.5`}
                    />
                  </div>
                </div>
                <div>
                  <span className="block text-sm font-medium text-zinc-300">UGC</span>
                  <span className="block text-xs text-zinc-500">
                    Enable if the image is a hyperrealistic person (UGC style animation)
                  </span>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || isAnimating || isGeneratingAnimation || !productImage || !actionDescription.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-6 py-3.5 font-semibold text-zinc-900 shadow-lg shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isGenerating ? 'Generating Prompt...' : 'Generate Nano Banana Prompt'}
              </button>
              <button
                onClick={handleAnimateImage}
                disabled={isGenerating || isAnimating || isGeneratingAnimation || !productImage || !actionDescription.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-500/90 to-blue-600/90 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isAnimating ? 'Generating Animation...' : 'Animate Uploaded Image'}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Nano Banana Prompt */}
        {nanoBananaPrompt && (
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-50">
                Nano Banana Pro Prompt
              </h2>
              <button
                onClick={() => copyToClipboard(nanoBananaPrompt, 'nano-banana')}
                className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                {copiedId === 'nano-banana' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {nanoBananaPrompt}
              </p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Use this prompt in Nano Banana Pro to generate a reference image. The prompt is optimized to create the perfect frame for your animation.
            </p>

            {/* Generated Image Upload Section */}
            <div className="mt-6 rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6">
              <label className="block text-sm font-medium text-zinc-300 mb-3">
                Upload Generated Image (from Nano Banana Pro)
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6 text-center hover:border-blue-500/40 transition-colors">
                    {generatedImagePreview ? (
                      <img
                        src={generatedImagePreview}
                        alt="Generated image preview"
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
                        <p className="text-sm">Click to upload generated image</p>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGeneratedImageUpload}
                    className="hidden"
                    disabled={isGeneratingAnimation}
                  />
                </label>
              </div>
              {generatedImage && (
                <button
                  onClick={handleGenerateAnimation}
                  disabled={isGeneratingAnimation}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-green-500/90 to-green-600/90 px-6 py-3.5 font-semibold text-white shadow-lg shadow-green-500/20 hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isGeneratingAnimation ? 'Generating Animation Prompt...' : 'Generate Video Animation Prompt'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Video Animation Prompt (from generated image) */}
        {videoAnimationPrompt && (
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-50">
                  Video Animation Prompt
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Based on generated image - attach the image when using this prompt
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(videoAnimationPrompt, 'video-animation-prompt')}
                className="rounded-lg bg-green-500/20 px-4 py-2 text-sm font-medium text-green-300 hover:bg-green-500/30 transition-colors"
              >
                {copiedId === 'video-animation-prompt' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {videoAnimationPrompt}
              </p>
            </div>
            <div className="mt-3 rounded-lg bg-green-500/10 border border-green-500/30 p-3">
              <p className="text-xs text-green-300">
                <strong>Important:</strong> When using this prompt in your video AI model, make sure to attach the generated image you uploaded above. The prompt is specifically designed to animate elements from that image based on your original description: "{actionDescription}"
              </p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Character count: {videoAnimationPrompt.length} / 999
            </p>
          </div>
        )}

        {/* Animation Prompt Only (when using Animate Uploaded Image) */}
        {animationPrompt && (
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-50">
                  Video Animation Prompt
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Based on uploaded image - attach the image when using this prompt
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(animationPrompt, 'animation-prompt')}
                className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/30 transition-colors"
              >
                {copiedId === 'animation-prompt' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {animationPrompt}
              </p>
            </div>
            <div className="mt-3 rounded-lg bg-blue-500/10 border border-blue-500/30 p-3">
              <p className="text-xs text-blue-300">
                <strong>Important:</strong> When using this prompt in your video AI model, make sure to attach the uploaded product image. The prompt is specifically designed to animate elements from the attached image.
              </p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Character count: {animationPrompt.length} / 999
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
