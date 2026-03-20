'use client';

import { useMemo, useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

export default function ConvertFileToUrl() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [geminiUri, setGeminiUri] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState(false);

  const canConvert = useMemo(() => !!file && !isConverting, [file, isConverting]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] || null;
    setError(null);
    setIsInsufficientCredits(false);
    setGeminiUri('');
    setMimeType('');
    setFileName('');

    if (!picked) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(picked);

    // Preview (optional, best-effort)
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(picked);
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsConverting(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeminiUri('');
    setMimeType('');
    setFileName('');

    try {
      const formData = new FormData();
      // Backend expects field name "file"
      formData.append('file', file);

      const response = await fetch('/api/convert-file-to-url', {
        method: 'POST',
        body: formData,
      });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // If server didn't return JSON, keep rawText as error
        if (!response.ok) setError(rawText || `Error ${response.status}`);
      }

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
        } else {
          setError(data?.error || data?.details || rawText || `Error ${response.status}`);
        }
        return;
      }

      setGeminiUri(data?.uri || data?.fileUri || '');
      setMimeType(data?.mimeType || '');
      setFileName(data?.name || file.name || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to convert file to URL');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
          Convert File To URL
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Subir imagen local a Gemini Files
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Sube una imagen local y obtén su <code>uri</code> interna de Gemini Files para usarla en otros tools.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-10">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
              Upload Image (local)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              disabled={isConverting}
              onChange={handleFileChange}
              className="block w-full cursor-pointer rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-50 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-500/15 file:px-4 file:py-2 file:text-amber-200 hover:file:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {previewUrl && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Preview
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="preview" className="max-h-72 w-auto rounded-xl object-contain" />
            </div>
          )}

          <button
            disabled={!canConvert}
            onClick={handleConvert}
            className={`w-full rounded-lg px-6 py-4 text-base font-semibold text-white transition-all ${
              canConvert
                ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 shadow-[0_0_35px_rgba(250,204,21,0.4)] hover:brightness-110 active:scale-[0.98]'
                : 'cursor-not-allowed bg-zinc-700 text-zinc-400'
            }`}
          >
            {isConverting ? 'Uploading...' : 'Convert File To URL'}
          </button>

          {isInsufficientCredits && (
            <div>
              <InsufficientCreditsError />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-4">
              <p className="text-sm font-medium text-red-200">{error}</p>
            </div>
          )}

          {geminiUri && (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/90">
                Gemini Files URI
              </p>
              <div className="mb-3 text-sm text-zinc-100">
                <div className="mb-1">
                  <span className="text-zinc-400">Name:</span> {fileName || '-'}
                </div>
                <div>
                  <span className="text-zinc-400">MIME:</span> {mimeType || '-'}
                </div>
              </div>

              <div className="mb-4">
                <code className="break-all text-sm text-zinc-100">{geminiUri}</code>
              </div>

              <div className="flex items-center gap-3">
                <CopyButton text={geminiUri} label="Copy URI" copiedLabel="Copied!" />
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

