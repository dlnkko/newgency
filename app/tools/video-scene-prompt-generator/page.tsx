'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';

interface ScenePrompt {
  sceneNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  nanoBananaPrompt: string;
  videoAnimationPrompt: string;
  description: string;
}

export default function VideoScenePromptGenerator() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [transformationDescription, setTransformationDescription] = useState<string>('');
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [costInfo, setCostInfo] = useState<any>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file');
        return;
      }
      setVideoFile(file);
      setError(null);
      setScenePrompts([]);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!videoFile) {
      setError('Please upload a video file');
      return;
    }

    if (!transformationDescription.trim()) {
      setError('Please describe how you want to transform the video');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setScenePrompts([]);
    setCostInfo(null);

    try {
      // Convert video to base64
      const videoBase64 = await fileToBase64(videoFile);

      const response = await fetch('/api/generate-video-scene-prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video: videoBase64,
          transformationDescription: transformationDescription.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
        } else {
          setError(data.error || 'Failed to generate scene prompts');
        }
        return;
      }

      setScenePrompts(data.scenePrompts || []);
      setCostInfo(data.usage);
    } catch (err) {
      setError('An error occurred while generating scene prompts');
      console.error('Error generating scene prompts:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50 sm:text-4xl">
            Video Scene Prompt Generator
          </h1>
          <p className="text-sm text-zinc-400 sm:text-base">
            Upload a video and describe how you want to transform it. The AI will analyze the video, identify relevant scenes, and generate detailed prompts for each scene while maintaining the original artistic essence.
          </p>
        </div>

        {/* Video Upload */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Upload Video
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm text-zinc-50 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-600 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {videoPreview && (
            <div className="mt-4">
              <video
                src={videoPreview}
                controls
                className="w-full rounded-xl border-2 border-zinc-700/50"
              />
            </div>
          )}
        </div>

        {/* Transformation Description */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Transformation Description
          </label>
          <textarea
            value={transformationDescription}
            onChange={(e) => setTransformationDescription(e.target.value)}
            placeholder="Describe how you want to transform the video. For example: 'Transform this basketball ad into an ad for headphones' or 'Change this to be about running instead of basketball' or 'Adapt this to showcase a skincare product'"
            rows={4}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>

        {/* Generate Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !videoFile || !transformationDescription.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)] transition-all hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_0_40px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600"
          >
            {isGenerating ? 'Analyzing video and generating scene prompts...' : 'Generate Scene Prompts'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Scene Prompts Results */}
        {scenePrompts.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-50">
                Generated Scene Prompts ({scenePrompts.length} scenes)
              </h2>
            </div>

            {/* Important Note about Reference Images */}
            {scenePrompts.length > 1 && (
              <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-200">
                  <strong className="text-amber-300">Important:</strong> Starting from Scene 2, the prompts are designed to use the generated image from the previous scene as a reference. When generating images in Nano Banana Pro, attach the image from the previous scene to maintain visual coherence (same person, product, colors, and style).
                </p>
              </div>
            )}

            {scenePrompts.map((scene, index) => (
              <div
                key={index}
                className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]"
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-bold uppercase tracking-wide text-amber-400">
                        Scene {scene.sceneNumber}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {formatTime(scene.startTime)} - {formatTime(scene.endTime)} ({scene.duration.toFixed(1)}s)
                      </p>
                    </div>
                  </div>

                  {scene.description && (
                    <div className="rounded-lg bg-zinc-800/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                        Scene Description
                      </p>
                      <p className="text-sm text-zinc-300">{scene.description}</p>
                    </div>
                  )}
                </div>

                {/* Nano Banana Pro Prompt */}
                <div className="mb-6 rounded-xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-base font-bold uppercase tracking-wide text-blue-400">
                      Nano Banana Pro Prompt
                    </h4>
                    <CopyButton
                      text={scene.nanoBananaPrompt}
                      label="Copy"
                      copiedLabel="Copied!"
                      className="bg-blue-500/10 text-blue-200 border-blue-500/50 hover:bg-blue-500/20 hover:border-blue-500/70"
                    />
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                      {scene.nanoBananaPrompt}
                    </p>
                  </div>
                </div>

                {/* Video Animation Prompt */}
                <div className="rounded-xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-base font-bold uppercase tracking-wide text-green-400">
                      Video Animation Prompt
                    </h4>
                    <CopyButton
                      text={scene.videoAnimationPrompt}
                      label="Copy"
                      copiedLabel="Copied!"
                      className="bg-green-500/10 text-green-200 border-green-500/50 hover:bg-green-500/20 hover:border-green-500/70"
                    />
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
                      {scene.videoAnimationPrompt}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    Character count: {scene.videoAnimationPrompt.length} / 999
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

