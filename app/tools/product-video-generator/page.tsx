'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

interface GeneratedPrompts {
  nanoBananaPrompt: string;
  videoPrompt: string;
}

type AnimationMode = 'animate-image' | 'frame-animation';

export default function ProductVideoGenerator() {
  const [mode, setMode] = useState<AnimationMode>('animate-image');
  const [productImage, setProductImage] = useState<File | null>(null);
  const [actionDescription, setActionDescription] = useState<string>('');
  const [isUGC, setIsUGC] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [nanoBananaPrompt, setNanoBananaPrompt] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<File | null>(null);
  const [generatedImagePreview, setGeneratedImagePreview] = useState<string | null>(null);
  const [videoAnimationPrompt, setVideoAnimationPrompt] = useState<string | null>(null);
  const [isGeneratingAnimation, setIsGeneratingAnimation] = useState<boolean>(false);
  const [animationPrompt, setAnimationPrompt] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Frame animation mode states
  const [startFrame, setStartFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [startFramePreview, setStartFramePreview] = useState<string | null>(null);
  const [lastFramePreview, setLastFramePreview] = useState<string | null>(null);
  const [frameAnimationDescription, setFrameAnimationDescription] = useState<string>('');
  const [frameAnimationPrompt, setFrameAnimationPrompt] = useState<string | null>(null);
  const [isGeneratingFrameAnimation, setIsGeneratingFrameAnimation] = useState<boolean>(false);
  
  
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

  const handleStartFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setStartFrame(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setStartFramePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLastFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLastFrame(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLastFramePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  
  const fileToBase64Video = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Compress and resize image to reduce file size
  const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.85): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

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
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            file.type,
            quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper function to compress and convert image to base64
  const compressAndConvertToBase64 = async (file: File): Promise<string> => {
    // Check file size (Vercel limit is ~4.5MB for request body)
    // Base64 encoding increases size by ~33%, so we limit original to ~3MB
    const maxSizeBytes = 3 * 1024 * 1024; // 3MB
    
    let imageToProcess = file;
    
    // If image is too large, compress it
    if (file.size > maxSizeBytes) {
      console.log(`Image size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds limit, compressing...`);
      try {
        imageToProcess = await compressImage(file, 1920, 1920, 0.85);
        console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
        
        // If still too large after compression, compress more aggressively
        if (imageToProcess.size > maxSizeBytes) {
          console.log('Still too large, compressing more aggressively...');
          imageToProcess = await compressImage(file, 1280, 1280, 0.75);
          console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
        }
      } catch (compressError) {
        console.error('Error compressing image:', compressError);
        throw new Error('Failed to compress image. Please try a smaller image file.');
      }
    }
    
    // Convert to base64
    const base64 = await fileToBase64(imageToProcess);
    
    // Check final base64 size (should be ~33% larger than original)
    const base64Size = new Blob([base64]).size;
    if (base64Size > 4 * 1024 * 1024) { // 4MB limit for base64 string
      throw new Error('Image is too large even after compression. Please use an image smaller than 3MB.');
    }

    return base64;
  };

  const handleGenerate = async () => {
    if (!productImage || !actionDescription.trim()) {
      setError('Please upload a product image and describe what should happen in the video');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsInsufficientCredits(false);
    setNanoBananaPrompt(null);
    setVideoAnimationPrompt(null);
    setGeneratedImage(null);
    setGeneratedImagePreview(null);

    try {
      const productBase64 = await compressAndConvertToBase64(productImage);

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
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setIsGenerating(false);
          return;
        }
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
    setIsInsufficientCredits(false);
    setVideoAnimationPrompt(null);

    try {
      const generatedImageBase64 = await compressAndConvertToBase64(generatedImage);

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
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setIsGeneratingAnimation(false);
          return;
        }
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
    setIsInsufficientCredits(false);
    setAnimationPrompt(null);

    try {
      const productBase64 = await compressAndConvertToBase64(productImage);

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
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setIsAnimating(false);
          return;
        }
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


  const handleGenerateFrameAnimation = async () => {
    if (!startFrame || !lastFrame || !frameAnimationDescription.trim()) {
      setError('Please upload both start and last frame images and describe what should happen');
      return;
    }

    setIsGeneratingFrameAnimation(true);
    setError(null);
    setIsInsufficientCredits(false);
    setFrameAnimationPrompt(null);

    try {
      const startFrameBase64 = await compressAndConvertToBase64(startFrame);
      const lastFrameBase64 = await compressAndConvertToBase64(lastFrame);

      const response = await fetch('/api/generate-frame-animation-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startFrame: startFrameBase64,
          lastFrame: lastFrameBase64,
          animationDescription: frameAnimationDescription.trim(),
          isUGC: isUGC,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
          setIsGeneratingFrameAnimation(false);
          return;
        }
        throw new Error(data.error || data.details || 'Failed to generate frame animation prompt');
      }

      setFrameAnimationPrompt(data.prompt || '');
    } catch (error: any) {
      console.error('Error generating frame animation prompt:', error);
      setError(error.message || 'Failed to generate frame animation prompt. Please try again.');
    } finally {
      setIsGeneratingFrameAnimation(false);
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

          {/* Mode Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Select Animation Mode
            </label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => {
                  setMode('animate-image');
                  // Reset other modes' states when switching modes
                  setStartFrame(null);
                  setLastFrame(null);
                  setStartFramePreview(null);
                  setLastFramePreview(null);
                  setFrameAnimationDescription('');
                  setFrameAnimationPrompt(null);
                }}
                className={`rounded-xl border-2 px-6 py-4 text-center transition-all ${
                  mode === 'animate-image'
                    ? 'border-amber-500/70 bg-amber-500/20 text-amber-200 shadow-lg shadow-amber-500/20'
                    : 'border-zinc-700/70 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                <div className="font-semibold mb-1">Animate Image</div>
                <div className="text-xs">Animate a single product image</div>
              </button>
              <button
                onClick={() => {
                  setMode('frame-animation');
                  // Reset other modes' states when switching modes
                  setProductImage(null);
                  setProductPreview(null);
                  setActionDescription('');
                  setNanoBananaPrompt(null);
                  setGeneratedImage(null);
                  setGeneratedImagePreview(null);
                  setVideoAnimationPrompt(null);
                  setAnimationPrompt(null);
                }}
                className={`rounded-xl border-2 px-6 py-4 text-center transition-all ${
                  mode === 'frame-animation'
                    ? 'border-amber-500/70 bg-amber-500/20 text-amber-200 shadow-lg shadow-amber-500/20'
                    : 'border-zinc-700/70 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                <div className="font-semibold mb-1">Start and Last Frame Animation</div>
                <div className="text-xs">Animate between two images</div>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Animate Image Mode */}
            {mode === 'animate-image' && (
              <>
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
              </>
            )}

            {/* Frame Animation Mode */}
            {mode === 'frame-animation' && (
              <>
                {/* Start Frame Upload */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Start Frame Image
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex-1 cursor-pointer">
                      <div className="rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6 text-center hover:border-amber-500/40 transition-colors">
                        {startFramePreview ? (
                          <img
                            src={startFramePreview}
                            alt="Start frame preview"
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
                            <p className="text-sm">Click to upload start frame</p>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleStartFrameUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Last Frame Upload */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Last Frame Image
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex-1 cursor-pointer">
                      <div className="rounded-xl border-2 border-dashed border-zinc-700/70 bg-zinc-950/50 p-6 text-center hover:border-amber-500/40 transition-colors">
                        {lastFramePreview ? (
                          <img
                            src={lastFramePreview}
                            alt="Last frame preview"
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
                            <p className="text-sm">Click to upload last frame</p>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLastFrameUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Animation Description */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    What should happen between the two frames?
                  </label>
                  <textarea
                    value={frameAnimationDescription}
                    onChange={(e) => setFrameAnimationDescription(e.target.value)}
                    placeholder="Example: The product rotates 360 degrees while moving from left to right, with smooth camera movement following the product"
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
                        Enable if the images contain hyperrealistic people (UGC style animation)
                      </span>
                    </div>
                  </label>
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerateFrameAnimation}
                  disabled={isGeneratingFrameAnimation || !startFrame || !lastFrame || !frameAnimationDescription.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-6 py-3.5 font-semibold text-zinc-900 shadow-lg shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isGeneratingFrameAnimation ? 'Generating Optimized Prompt...' : 'Generate Optimized Animation Prompt'}
                </button>
              </>
            )}


            {/* Insufficient Credits Error */}
            {isInsufficientCredits && (
              <div className="mb-4">
                <InsufficientCreditsError />
              </div>
            )}

            {/* Error Message */}
            {error && !isInsufficientCredits && (
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


        {/* Frame Animation Prompt */}
        {frameAnimationPrompt && (
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-50">
                  Optimized Frame Animation Prompt
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Based on start and last frame - attach both images when using this prompt
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(frameAnimationPrompt, 'frame-animation-prompt')}
                className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                {copiedId === 'frame-animation-prompt' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl border border-zinc-700/70 bg-zinc-950/50 p-4">
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {frameAnimationPrompt}
              </p>
            </div>
            <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <p className="text-xs text-amber-300">
                <strong>Important:</strong> When using this prompt in your video AI model, make sure to attach both the start frame and last frame images. The prompt is specifically optimized to create a smooth animation transition between these two frames based on your description: "{frameAnimationDescription}"
              </p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Character count: {frameAnimationPrompt.length} / 999
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
