'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

export default function ViralScriptGenerator() {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [metaAdUrl, setMetaAdUrl] = useState<string>('');
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState<string>('');
  const [creativeAngle, setCreativeAngle] = useState<string>('');
  const [duration, setDuration] = useState<number | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isIterating, setIsIterating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('video/')) {
        setError('Please upload a video file');
        return;
      }
      setUploadedVideo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      // Clear URL inputs when video is uploaded
      setVideoUrl('');
      setMetaAdUrl('');
    }
  };

  const removeUploadedVideo = () => {
    setUploadedVideo(null);
    setVideoPreview(null);
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
    if (!videoUrl.trim() && !metaAdUrl.trim() && !uploadedVideo) {
      setError('Please enter a video URL (Instagram Reel or TikTok), a Meta Ad URL, or upload a video');
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
      let response: Response;
      if (uploadedVideo) {
        // Send video as FormData to avoid body size limit in production (base64 in JSON exceeds ~4.5 MB)
        const formData = new FormData();
        formData.append('video', uploadedVideo);
        formData.append('productDescription', productDescription);
        formData.append('creativeAngle', creativeAngle.trim() || '');
        formData.append('duration', duration !== null ? String(duration) : '');
        formData.append('videoUrl', '');
        formData.append('metaAdUrl', '');
        response = await fetch('/api/generate-viral-script', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/generate-viral-script', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: videoUrl.trim() || null,
            metaAdUrl: metaAdUrl.trim() || null,
            video: null,
            productDescription,
            creativeAngle: creativeAngle.trim() || null,
            duration: duration,
          }),
        });
      }

      const rawText = await response.text();
      let data: { script?: string; error?: string; details?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (!response.ok) {
          setError(rawText || `Error ${response.status}: ${response.statusText}`);
        } else {
          setError('Invalid response from server. Please try again.');
        }
        return;
      }

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
        } else if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
          setIsInsufficientCredits(false);
        } else {
          const msg = data.error || rawText || 'Failed to generate viral script';
          setError(msg.includes('Entity Too Large') || msg.includes('413') ? 'Video is too large. Try a shorter or smaller video (e.g. under 4 MB).' : msg);
          setIsInsufficientCredits(false);
        }
        return;
      }

      setGeneratedScript(data.script || '');
    } catch (err) {
      setError('An error occurred while generating the script');
      console.error('Error generating viral script:', err);
    } finally {
      setIsGenerating(false);
      setIsScraping(false);
    }
  };

  const handleIterate = async () => {
    if (!generatedScript.trim()) {
      setError('No script to iterate. Please generate a script first.');
      return;
    }

    if (!duration) {
      setError('Please select a duration to iterate the script');
      return;
    }

    setIsIterating(true);
    setError(null);
    setIsInsufficientCredits(false);

    try {
      const response = await fetch('/api/adapt-viral-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalScript: generatedScript,
          duration: duration,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
        } else if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
          setIsInsufficientCredits(false);
        } else {
          setError(data.error || 'Failed to iterate script');
          setIsInsufficientCredits(false);
        }
        return;
      }

      setGeneratedScript(data.script);
    } catch (err) {
      setError('An error occurred while iterating the script');
      console.error('Error iterating script:', err);
    } finally {
      setIsIterating(false);
    }
  };

  // Detect platform from URL
  const isInstagram = videoUrl.includes('instagram.com/reel') || videoUrl.includes('instagram.com/p/');
  const isTikTok = videoUrl.includes('tiktok.com');
  const isMetaAd = metaAdUrl.includes('facebook.com/ads/library') || metaAdUrl.includes('meta.com/ads/library');

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

        {/* Video Upload Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Upload Video <span className="text-xs font-normal text-zinc-500">(Optional if URL provided)</span>
          </label>
          {videoPreview ? (
            <div className="relative">
              <video
                src={videoPreview}
                controls
                className="w-full max-w-md rounded-xl border-2 border-zinc-700/50"
              />
              <button
                onClick={removeUploadedVideo}
                disabled={isGenerating}
                className="absolute right-2 top-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 p-8 transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
              <svg className="mb-2 h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-zinc-400">Click to upload video</span>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
                disabled={isGenerating}
              />
            </label>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Upload a video file to extract the script. The video will be analyzed to generate a transcript.
          </p>
        </div>

        {/* Video URL Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Instagram Reel or TikTok URL <span className="text-xs font-normal text-zinc-500">(Optional if video uploaded or Meta Ad URL provided)</span>
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              if (e.target.value.trim()) {
                setUploadedVideo(null);
                setVideoPreview(null);
              }
            }}
            placeholder="https://www.instagram.com/reel/... or https://www.tiktok.com/..."
            disabled={isGenerating || !!uploadedVideo}
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

        {/* Meta Ad URL Input */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Meta Ad URL <span className="text-xs font-normal text-zinc-500">(Optional if video uploaded or Video URL provided)</span>
          </label>
          <input
            type="text"
            value={metaAdUrl}
            onChange={(e) => {
              setMetaAdUrl(e.target.value);
              if (e.target.value.trim()) {
                setUploadedVideo(null);
                setVideoPreview(null);
              }
            }}
            placeholder="https://www.facebook.com/ads/library/?id=XXXXX"
            disabled={isGenerating || !!uploadedVideo}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {metaAdUrl && (
            <p className="mt-2 text-xs text-zinc-500">
              {isMetaAd && '✓ Meta Ad URL detected'}
              {!isMetaAd && metaAdUrl && '⚠ Please enter a valid Meta Ad Library URL'}
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Provide either a video upload, video URL (Instagram/TikTok), or a Meta Ad URL. The script will be generated from the transcript of the provided source.
          </p>
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

        {/* Creative Angle Input (Optional) */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Creative Angle <span className="text-xs font-normal text-zinc-500">(Optional)</span>
          </label>
          <textarea
            value={creativeAngle}
            onChange={(e) => setCreativeAngle(e.target.value)}
            placeholder="Enter a creative angle or approach for the script... (e.g., 'Focus on the transformation story', 'Emphasize the before/after comparison', 'Highlight the unique ingredient story', 'Tell it from a customer testimonial perspective')"
            rows={4}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Optional: Provide a creative direction or angle. The script will be generated based on this angle while maintaining the format and style of the scraped video.
          </p>
        </div>

        {/* Duration Selection */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Video Duration
          </label>
          <div className="grid grid-cols-4 gap-3">
            {[15, 30, 45, 60].map((seconds) => (
              <button
                key={seconds}
                onClick={() => setDuration(duration === seconds ? null : seconds)}
                disabled={isGenerating}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  duration === seconds
                    ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.3)] ring-2 ring-amber-500/30'
                    : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Select the target duration for your video. The script will be adapted to fit within this timeframe.
          </p>
        </div>

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || (!videoUrl.trim() && !metaAdUrl.trim() && !uploadedVideo) || !productDescription.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isScraping ? 'Scraping transcript...' : isGenerating ? 'Generating viral script...' : 'Generate Viral Script'}
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
            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handleIterate}
                disabled={isIterating || !duration}
                className="flex-1 rounded-xl border-2 border-blue-500/70 bg-gradient-to-r from-blue-500/30 to-blue-500/20 px-6 py-3 font-bold text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all hover:from-blue-500/40 hover:to-blue-500/30 hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIterating ? 'Iterating...' : 'Iterate Script'}
              </button>
              <CopyButton 
                text={generatedScript} 
                label="Copy Script"
                copiedLabel="Copied!"
              />
            </div>
            {!duration && (
              <p className="text-xs text-amber-400/70">
                Select a duration above to enable script iteration
              </p>
            )}

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
