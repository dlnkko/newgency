'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';

type StyleType = 'hyperrealistic' | 'studio-quality' | 'design' | null;

export default function ImagePromptGenerator() {
  const [description, setDescription] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleType>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [costInfo, setCostInfo] = useState<any>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);

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
      setError('Please select a style (Hyperrealistic, Studio Quality, or Design)');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedPrompt('');
    setCostInfo(null);

    try {
      // Convert reference image to base64 if provided
      let referenceImageBase64 = null;
      if (referenceImage) {
        referenceImageBase64 = await fileToBase64(referenceImage);
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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
        } else {
          setError(data.error || 'Failed to generate prompt');
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
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want in the image. For example: 'A person using headphones while exercising in a gym', 'A skincare product on a bathroom counter with natural lighting', 'An infographic showing the benefits of a supplement'"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </div>
        </div>

        {/* Reference Image Upload (for design, studio-quality, and hyperrealistic) */}
        {(selectedStyle === 'design' || selectedStyle === 'studio-quality' || selectedStyle === 'hyperrealistic') && (
          <div className="mb-8">
            <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Reference Image (Optional)
            </label>
            <p className="mb-3 text-xs text-zinc-400">
              {selectedStyle === 'hyperrealistic' 
                ? 'Upload a reference image of a person. The generated prompt will maintain the same person but adapt them to the new action or environment you describe.'
                : 'Upload a reference image to help guide the prompt generation. The generated prompt will reference this image for better results.'}
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

        {/* Error Message */}
        {error && (
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
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Style: {selectedStyle === 'hyperrealistic' && 'Hyperrealistic'}
                    {selectedStyle === 'studio-quality' && 'Studio Quality'}
                    {selectedStyle === 'design' && 'Design'}
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

