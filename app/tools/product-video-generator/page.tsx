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
  const [script, setScript] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompts | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Last frame and animation flow (first frame → last frame prompt → user uploads last frame → animation prompt)
  const [lastFrameImage, setLastFrameImage] = useState<File | null>(null);
  const [lastFramePreview, setLastFramePreview] = useState<string | null>(null);
  const [lastFrameNanoBananaPrompt, setLastFrameNanoBananaPrompt] = useState<string | null>(null);
  const [isGeneratingLastFramePrompt, setIsGeneratingLastFramePrompt] = useState<boolean>(false);
  const [isGeneratingAnimationFromFrames, setIsGeneratingAnimationFromFrames] = useState<boolean>(false);

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

  const handleLastFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLastFrameImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLastFramePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLastFrame = () => {
    setLastFrameImage(null);
    setLastFramePreview(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Compress image so large uploads stay under request size limit (~4.5 MB)
  const compressImage = (file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.82): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            } else {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = (e.target?.result as string) || '';
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
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
      // Compress when needed so request body stays under ~4.5 MB (base64 is ~33% larger than file)
      const maxSizeBeforeCompress = 1.5 * 1024 * 1024; // 1.5 MB
      let imageToSend = productImage;
      if (productImage.size > maxSizeBeforeCompress) {
        const targetMaxSize = productImage.size > 5 * 1024 * 1024 ? 1200 : 1920; // very large -> smaller max side
        const targetQuality = productImage.size > 5 * 1024 * 1024 ? 0.72 : 0.82;
        imageToSend = await compressImage(productImage, targetMaxSize, targetMaxSize, targetQuality);
      }
      const productBase64 = await fileToBase64(imageToSend);

      const response = await fetch('/api/generate-product-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productImage: productBase64,
          actionDescription: actionDescription.trim(),
          script: script.trim() || null,
        }),
      });

      const rawText = await response.text();
      let data: { error?: string; details?: string; nanoBananaPrompt?: string; videoPrompt?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) {
          throw new Error(rawText || `Error ${response.status}: ${response.statusText}`);
        }
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!response.ok) {
        throw new Error(data.error || data.details || rawText || 'Failed to generate prompts');
      }

      setGeneratedPrompts({
        nanoBananaPrompt: data.nanoBananaPrompt || '',
        videoPrompt: data.videoPrompt || '',
      });
    } catch (error: any) {
      console.error('Error generating prompts:', error);
      let message = error.message || 'Failed to generate prompts. Please try again.';
      if (message.includes('Entity Too Large') || message.includes('413') || message.includes('Request En')) {
        message = 'Image is too large. Please use a smaller image (e.g. under 2–3 MB) or compress it.';
      }
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateLastFramePrompt = async () => {
    if (!productImage || !actionDescription.trim()) {
      setError('Please upload the first frame image and describe the animation');
      return;
    }
    setIsGeneratingLastFramePrompt(true);
    setError(null);
    setLastFrameNanoBananaPrompt(null);
    try {
      const maxSizeBeforeCompress = 1.5 * 1024 * 1024;
      let imageToSend = productImage;
      if (productImage.size > maxSizeBeforeCompress) {
        imageToSend = await compressImage(productImage, 1920, 1920, 0.82);
      }
      const productBase64 = await fileToBase64(imageToSend);
      const response = await fetch('/api/generate-product-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImage: productBase64,
          actionDescription: actionDescription.trim(),
          script: script.trim() || null,
          lastFrameNanoBananaOnly: true,
        }),
      });
      const rawText = await response.text();
      let data: { error?: string; details?: string; nanoBananaPrompt?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) throw new Error(rawText || `Error ${response.status}`);
        throw new Error('Invalid response from server.');
      }
      if (!response.ok) throw new Error(data.error || data.details || rawText || 'Failed to generate last frame prompt');
      setLastFrameNanoBananaPrompt(data.nanoBananaPrompt || '');
    } catch (err: any) {
      setError(err.message || 'Failed to generate last frame prompt.');
    } finally {
      setIsGeneratingLastFramePrompt(false);
    }
  };

  const handleGenerateAnimationFromFrames = async () => {
    if (!productImage || !lastFrameImage || !actionDescription.trim()) {
      setError('Please upload both first frame and last frame images');
      return;
    }
    setIsGeneratingAnimationFromFrames(true);
    setError(null);
    setGeneratedPrompts(null);
    try {
      const maxSize = 1.5 * 1024 * 1024;
      let firstToSend = productImage;
      let lastToSend = lastFrameImage;
      if (productImage.size > maxSize) {
        firstToSend = await compressImage(productImage, 1920, 1920, 0.82);
      }
      if (lastFrameImage.size > maxSize) {
        lastToSend = await compressImage(lastFrameImage, 1920, 1920, 0.82);
      }
      const productBase64 = await fileToBase64(firstToSend);
      const lastFrameBase64 = await fileToBase64(lastToSend);
      const response = await fetch('/api/generate-product-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImage: productBase64,
          lastFrameImage: lastFrameBase64,
          actionDescription: actionDescription.trim(),
          script: script.trim() || null,
          firstAndLastFrameAnimation: true,
        }),
      });
      const rawText = await response.text();
      let data: { error?: string; details?: string; videoPrompt?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) throw new Error(rawText || `Error ${response.status}`);
        throw new Error('Invalid response from server.');
      }
      if (!response.ok) throw new Error(data.error || data.details || rawText || 'Failed to generate animation prompt');
      setGeneratedPrompts({
        nanoBananaPrompt: lastFrameNanoBananaPrompt || '',
        videoPrompt: data.videoPrompt || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to generate animation prompt.');
    } finally {
      setIsGeneratingAnimationFromFrames(false);
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
              Generate professional product video animation prompts for video generation
            </p>
          </div>

          <div className="space-y-6">
            {/* Product / First Frame Image Upload */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Product image / First frame (as clean as possible)
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                For &quot;Generate last frame and animation&quot;, this image is the start of the animation.
              </p>
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

            {/* Script (dialogue a character must say – 100% included in final prompt) */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Script (optional)
              </label>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Exact words a character must say in the video (voiceover or on-screen). This text will be 100% included in the final animation prompt."
                className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                rows={3}
              />
              <p className="mt-1 text-xs text-zinc-500">
                If you fill this in, the final prompt will state that a character must say this script verbatim.
              </p>
            </div>

            {/* Generate Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || isGeneratingLastFramePrompt || isGeneratingAnimationFromFrames || !productImage || !actionDescription.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-6 py-3.5 font-semibold text-zinc-900 shadow-lg shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isGenerating ? 'Generating...' : 'Generate Prompts'}
              </button>
              <button
                onClick={handleGenerateLastFramePrompt}
                disabled={isGenerating || isGeneratingLastFramePrompt || isGeneratingAnimationFromFrames || !productImage || !actionDescription.trim()}
                className="flex-1 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 px-6 py-3.5 font-semibold text-amber-300 shadow-lg border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isGeneratingLastFramePrompt ? 'Generating...' : 'Generate last frame and animation'}
              </button>
            </div>

            {/* Step 1 result: Last frame Nano Banana prompt + upload last frame + step 2 button */}
            {lastFrameNanoBananaPrompt && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-4">
                <p className="text-sm font-medium text-amber-200">
                  Step 1 done. Use the prompt below in Nano Banana to generate the <strong>last frame</strong>. Then upload that image here and click &quot;Generate animation (first → last)&quot;.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Nano Banana prompt (last frame)</span>
                  <button
                    onClick={() => copyToClipboard(lastFrameNanoBananaPrompt, 'last-frame-nano')}
                    className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30"
                  >
                    {copiedId === 'last-frame-nano' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="rounded-lg border border-zinc-700/70 bg-zinc-950/50 p-3">
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{lastFrameNanoBananaPrompt}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Last frame (upload the image you generated with the prompt above)
                  </label>
                  {!lastFramePreview ? (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-900/50 p-6 text-center hover:border-amber-500/50 transition-colors">
                      <span className="text-sm text-zinc-400">Click to upload last frame image</span>
                      <input type="file" accept="image/*" onChange={handleLastFrameUpload} className="hidden" />
                    </label>
                  ) : (
                    <div className="relative inline-block">
                      <img src={lastFramePreview} alt="Last frame" className="max-h-40 rounded-lg border border-zinc-700" />
                      <button
                        type="button"
                        onClick={removeLastFrame}
                        className="absolute right-2 top-2 rounded-full bg-red-500/90 p-1.5 text-white hover:bg-red-500"
                        title="Remove last frame"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleGenerateAnimationFromFrames}
                  disabled={isGeneratingAnimationFromFrames || !lastFrameImage}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-6 py-3 font-semibold text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingAnimationFromFrames ? 'Generating animation...' : 'Generate animation (first → last)'}
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Generated Video Animation Prompt */}
        {generatedPrompts && (
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
        )}
      </div>
    </DashboardLayout>
  );
}
