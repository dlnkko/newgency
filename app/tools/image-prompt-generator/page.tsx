'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

type StyleType = 'hyperrealistic' | 'studio-quality' | 'design' | 'copy-image' | null;

export default function ImagePromptGenerator() {
  const [description, setDescription] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleType>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);
  const [costInfo, setCostInfo] = useState<any>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const [veo3FirstFrame, setVeo3FirstFrame] = useState<boolean>(false);

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

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please describe what you want the image to be about');
      return;
    }

    if (!selectedStyle) {
      setError('Please select a style (Hyperrealistic, Studio Quality, Design, or Copy Image)');
      return;
    }

    if (selectedStyle === 'copy-image' && !referenceImage) {
      setError('Please upload a reference image for Copy Image mode');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeneratedPrompt('');
    setCostInfo(null);

    try {
      // Convert reference image to base64 if provided
      let referenceImageBase64 = null;
      if (referenceImage) {
        // Check file size (Vercel limit is ~4.5MB for request body)
        // Base64 encoding increases size by ~33%, so we limit original to ~3MB
        const maxSizeBytes = 3 * 1024 * 1024; // 3MB
        
        let imageToProcess = referenceImage;
        
        // If image is too large, compress it
        if (referenceImage.size > maxSizeBytes) {
          console.log(`Image size (${(referenceImage.size / 1024 / 1024).toFixed(2)}MB) exceeds limit, compressing...`);
          try {
            imageToProcess = await compressImage(referenceImage, 1920, 1920, 0.85);
            console.log(`Compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            
            // If still too large after compression, compress more aggressively
            if (imageToProcess.size > maxSizeBytes) {
              console.log('Still too large, compressing more aggressively...');
              imageToProcess = await compressImage(referenceImage, 1280, 1280, 0.75);
              console.log(`Re-compressed to ${(imageToProcess.size / 1024 / 1024).toFixed(2)}MB`);
            }
          } catch (compressError) {
            console.error('Error compressing image:', compressError);
            setError('Failed to compress image. Please try a smaller image file.');
            return;
          }
        }
        
        // Convert to base64
        referenceImageBase64 = await fileToBase64(imageToProcess);
        
        // Check final base64 size (should be ~33% larger than original)
        const base64Size = new Blob([referenceImageBase64]).size;
        if (base64Size > 4 * 1024 * 1024) { // 4MB limit for base64 string
          setError('Image is too large even after compression. Please use an image smaller than 3MB.');
          return;
        }
      }

      const response = await fetch('/api/generate-image-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description.trim(),
          style: selectedStyle,
          referenceImage: referenceImageBase64,
          firstFrameFromVideo: veo3FirstFrame
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
          // Show detailed error message if available
          const errorMessage = data.error || 'Failed to generate prompt';
          const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
          setError(`${errorMessage}${errorDetails}`);
          setIsInsufficientCredits(false);
        }
        return;
      }

      setGeneratedPrompt(data.prompt || '');
      setCostInfo(data.usage);
    } catch (err) {
      setError('An error occurred while generating the prompt');
      console.error('Error generating prompt:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50 sm:text-4xl">
            Image Prompt Generator
          </h1>
          <p className="text-sm text-zinc-400 sm:text-base">
            Describe what you want the image to be about and select a style. Get a detailed, professional prompt optimized for AI image generation.
          </p>
        </div>

        {/* Description Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            What should the image be about?
          </label>
          {/* Veo 3 toggle (first frame from video prompt) */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-500">
              If your text is a video-style prompt (scenes, hook, concept), enable Veo 3 to generate an image prompt for the first frame.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Veo 3</span>
              <button
                onClick={() => setVeo3FirstFrame(!veo3FirstFrame)}
                disabled={isGenerating}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                  veo3FirstFrame ? 'bg-amber-500/80' : 'bg-zinc-700/50'
                }`}
                title="If ON, generate an image prompt representing the first frame of the described video."
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    veo3FirstFrame ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs font-medium ${veo3FirstFrame ? 'text-amber-400' : 'text-zinc-500'}`}>
                {veo3FirstFrame ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={selectedStyle === 'copy-image' 
              ? "Describe what you want to change or make different in the reference image. For example: 'Change the background to a beach scene', 'Replace the person with a different person', 'Change the product color to blue', 'Make it more vibrant and colorful', 'Change the lighting to sunset'"
              : "Describe what you want in the image. For example: 'A person using headphones while exercising in a gym', 'A skincare product on a bathroom counter with natural lighting', 'An infographic showing the benefits of a supplement'"}
            rows={6}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Style Selection */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Select Style
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => setSelectedStyle('hyperrealistic')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'hyperrealistic'
                  ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 shadow-[0_0_30px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-amber-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🎯</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Hyperrealistic</h3>
              <p className="text-xs text-zinc-400">
                Maximum realism with authentic shadows, lights, textures, and colors. Perfect for realistic people, environments, and objects.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('studio-quality')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'studio-quality'
                  ? 'border-blue-500/80 bg-gradient-to-br from-blue-500/20 to-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-blue-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">📸</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Studio Quality</h3>
              <p className="text-xs text-zinc-400">
                Professional photography style with artificial lighting, clarity, and detail. Like photos taken in a professional studio.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('design')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'design'
                  ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-purple-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🎨</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Design</h3>
              <p className="text-xs text-zinc-400">
                Creative designs like infographics or static ads. Human-made quality with attention to every detail, colors, and composition.
              </p>
            </button>

            <button
              onClick={() => setSelectedStyle('copy-image')}
              disabled={isGenerating}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                selectedStyle === 'copy-image'
                  ? 'border-green-500/80 bg-gradient-to-br from-green-500/20 to-green-500/10 shadow-[0_0_30px_rgba(34,197,94,0.2)] ring-1 ring-green-500/30'
                  : 'border-zinc-700/50 bg-zinc-800/30 hover:border-green-500/50 hover:bg-zinc-800/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="mb-2 text-2xl">🔄</div>
              <h3 className="mb-2 text-lg font-bold text-zinc-50">Copy Image</h3>
              <p className="text-xs text-zinc-400">
                Upload a reference image and describe what you want to change or make different. The AI will iterate on the image while maintaining its core characteristics.
              </p>
            </button>
          </div>
        </div>

        {/* Reference Image Upload (for design, studio-quality, hyperrealistic, and copy-image) */}
        {(selectedStyle === 'design' || selectedStyle === 'studio-quality' || selectedStyle === 'hyperrealistic' || selectedStyle === 'copy-image') && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Reference Image (Optional)
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              {selectedStyle === 'hyperrealistic' 
                ? 'Upload a reference image (for example, a hyperrealistic image). The AI will analyze the image and create a detailed prompt describing its style, light, texture, and aesthetics. Then it will use that prompt as a reference to create the final prompt based on your description, incorporating the same level of hyperrealism, lighting, and texture quality.'
                : selectedStyle === 'studio-quality'
                ? 'Upload a reference image (for example, a professional studio photo). The AI will analyze the image and create a detailed prompt describing its style, lighting, composition, and aesthetics. Then it will use that prompt as a reference to create the final prompt based on your description, incorporating the same lighting style, composition, and professional quality.'
                : selectedStyle === 'copy-image'
                ? 'Upload a reference image that you want to iterate on. The AI will analyze the image and create a prompt that varies it based on what you want to change or make different, while maintaining the core visual characteristics.'
                : 'Upload a reference image (for example, a design or infographic). The AI will analyze the image and create a detailed prompt describing its design style, colors, typography, and composition. Then it will use that prompt as a reference to create the final prompt based on your description, incorporating the same design style, color palette, and visual aesthetics.'}
            </p>
            <div className="space-y-4">
              {!referenceImagePreview ? (
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-zinc-400">
                    Click to upload or drag and drop
                  </span>
                  <span className="mt-1 text-xs text-zinc-500">
                    PNG, JPG, WEBP up to 10MB
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleReferenceImageUpload}
                    className="hidden"
                    disabled={isGenerating}
                  />
                </label>
              ) : (
                <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                  <div className="relative inline-block">
                    <img
                      src={referenceImagePreview}
                      alt="Reference preview"
                      className="max-h-64 rounded-lg object-contain"
                    />
                    <button
                      onClick={() => {
                        setReferenceImage(null);
                        setReferenceImagePreview(null);
                      }}
                      disabled={isGenerating}
                      className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove image"
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
          </div>
        )}

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim() || !selectedStyle}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isGenerating ? 'Generating Prompt...' : 'Generate Prompt'}
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

        {/* Generated Prompt */}
        {generatedPrompt && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-50">
                Generated Prompt
              </h2>
            </div>

            <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-amber-400">
                    {selectedStyle === 'hyperrealistic' && 'Hyperrealistic Image Prompt'}
                    {selectedStyle === 'studio-quality' && 'Studio Quality Image Prompt'}
                    {selectedStyle === 'design' && 'Design Image Prompt'}
                    {selectedStyle === 'copy-image' && 'Copy Image Prompt'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Style: {selectedStyle === 'hyperrealistic' && 'Hyperrealistic'}
                    {selectedStyle === 'studio-quality' && 'Studio Quality'}
                    {selectedStyle === 'design' && 'Design'}
                    {selectedStyle === 'copy-image' && 'Copy Image'}
                  </p>
                </div>
                <CopyButton
                  text={generatedPrompt}
                  label="Copy Prompt"
                  copiedLabel="Copied!"
                />
              </div>

              <div className="prose prose-invert max-w-none">
                <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                  {generatedPrompt}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

