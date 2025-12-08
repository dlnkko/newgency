'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';

export default function StaticAdPromptGenerator() {
  const [staticAdImage, setStaticAdImage] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [copywriting, setCopywriting] = useState<string>('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [staticAdPreview, setStaticAdPreview] = useState<string | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [costInfo, setCostInfo] = useState<any>(null);

  const handleStaticAdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setStaticAdImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setStaticAdPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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

  const isValidUrl = (string: string): boolean => {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  };

  const handleGenerate = async () => {
    if (!staticAdImage || !productImage) {
      setError('Please upload both the static ad image and your product image');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedPrompt('');

    try {
      // Convert images to base64
      const staticAdBase64 = await fileToBase64(staticAdImage);
      const productBase64 = await fileToBase64(productImage);

      // Check if copywriting is a URL
      const isUrl = copywriting.trim() && isValidUrl(copywriting.trim());
      let copywritingInput = copywriting || null;

      // If it's a URL, scrape it first
      if (isUrl) {
        setIsScraping(true);
        try {
          console.log('Scraping URL:', copywriting.trim());
          const scrapeResponse = await fetch('/api/scrape-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: copywriting.trim(),
            }),
          });

          const scrapeData = await scrapeResponse.json();
          console.log('Scrape response:', scrapeData);

          if (!scrapeResponse.ok) {
            const errorMsg = scrapeData.error || scrapeData.details || 'Failed to scrape URL';
            console.error('Scrape error:', errorMsg, scrapeData);
            throw new Error(errorMsg);
          }

          // Use the summary from scraping
          if (!scrapeData.summary || scrapeData.summary === 'No summary available') {
            console.warn('No summary available in scrape response:', scrapeData);
            throw new Error('No summary could be extracted from the URL. Please try a different URL or enter copywriting manually.');
          }

          // Store both summary and branding as JSON string
          const scrapeResult = {
            summary: scrapeData.summary,
            branding: scrapeData.branding || null,
          };
          copywritingInput = JSON.stringify(scrapeResult);
          
          if (scrapeData.summary) {
            console.log('Summary extracted:', scrapeData.summary.substring(0, 100) + '...');
          }
          if (scrapeData.branding) {
            console.log('Branding extracted:', {
              colors: scrapeData.branding.colors ? Object.keys(scrapeData.branding.colors).length + ' colors' : 'none',
              typography: scrapeData.branding.typography ? 'yes' : 'no',
            });
          }
        } catch (scrapeError: any) {
          console.error('Error scraping URL:', scrapeError);
          setError(`Failed to scrape URL: ${scrapeError.message}. Please check the URL or enter copywriting manually.`);
          setIsGenerating(false);
          setIsScraping(false);
          return;
        } finally {
          setIsScraping(false);
        }
      }

      const response = await fetch('/api/generate-static-ad-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staticAdImage: staticAdBase64,
          productImage: productBase64,
          copywriting: copywritingInput || null,
          isUrlScraped: isUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate prompt');
      }

      setGeneratedPrompt(data.prompt);
      setDebugInfo(data.debug || null);
      setCostInfo(data.cost || null);
      
      // Log debug info to console
      if (data.debug) {
        console.log('=== DEBUG INFO ===', data.debug);
      }
      if (data.cost) {
        console.log('=== COST INFO ===', data.cost);
      }
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      setError(error.message || 'Failed to generate prompt. Please try again.');
    } finally {
      setIsGenerating(false);
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

  const canGenerate = staticAdImage && productImage;

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/70">
          Static Ad Prompt Generator
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          AI Static Ad Prompt Generator
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Upload a reference static ad and your product image. AI will analyze the ad design and create a custom prompt for your product.
        </p>
      </div>

      <div className="space-y-8">
        {/* Image Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Static Ad Upload */}
          <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <label className="mb-4 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Reference Static Ad Image
            </label>
            <div className="space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleStaticAdUpload}
                className="hidden"
                id="static-ad-upload"
              />
              <label
                htmlFor="static-ad-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 p-6 transition-all hover:border-amber-500/50 hover:bg-zinc-800/50"
              >
                {staticAdPreview ? (
                  <img
                    src={staticAdPreview}
                    alt="Static ad preview"
                    className="max-h-64 w-full rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <svg
                      className="mb-2 h-12 w-12 text-zinc-500"
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
                    <span className="text-sm text-zinc-400">Click to upload static ad</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Product Upload */}
          <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <label className="mb-4 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
              Your Product Image
            </label>
            <div className="space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleProductUpload}
                className="hidden"
                id="product-upload"
              />
              <label
                htmlFor="product-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 p-6 transition-all hover:border-amber-500/50 hover:bg-zinc-800/50"
              >
                {productPreview ? (
                  <img
                    src={productPreview}
                    alt="Product preview"
                    className="max-h-64 w-full rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <svg
                      className="mb-2 h-12 w-12 text-zinc-500"
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
                    <span className="text-sm text-zinc-400">Click to upload product</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Copywriting Input */}
        <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
            Copywriting / Product Page URL <span className="text-xs font-normal text-zinc-500">(Optional)</span>
          </label>
          <textarea
            value={copywriting}
            onChange={(e) => setCopywriting(e.target.value)}
            placeholder="Enter copywriting text, brand messaging, OR paste a product page URL to automatically extract product information..."
            rows={4}
            className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
          />
          {copywriting.trim() && isValidUrl(copywriting.trim()) && (
            <p className="mt-2 text-xs text-amber-400/70">
              🔗 URL detected - Product page will be scraped automatically
            </p>
          )}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full rounded-xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-500/20 px-8 py-4 font-bold text-amber-200 shadow-[0_0_30px_rgba(250,204,21,0.25)] transition-all hover:from-amber-500/30 hover:via-amber-500/25 hover:to-amber-500/30 hover:shadow-[0_0_40px_rgba(250,204,21,0.35)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500/20 disabled:hover:via-amber-500/15 disabled:hover:to-amber-500/20 disabled:hover:scale-100"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
              <span>
                {isScraping 
                  ? 'Scraping product page...' 
                  : 'Analyzing images and generating prompt...'}
              </span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>✨</span>
              <span>Generate Prompt</span>
            </span>
          )}
        </button>

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Generated Prompt */}
        {generatedPrompt && (
          <>
            <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-8 shadow-[0_0_50px_rgba(250,204,21,0.2)]">
              <div className="mb-6 flex items-center justify-between border-b border-zinc-800/50 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-amber-300">Generated Prompt</h3>
                  <p className="mt-1 text-xs text-zinc-500">Ready to use in Nano Banana Pro</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPrompt);
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-all hover:border-amber-500/70 hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(250,204,21,0.2)]"
                >
                  <span>📋</span>
                  <span>Copy</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl border-2 border-zinc-800/50 bg-zinc-950/70 p-6 text-sm leading-relaxed text-zinc-200 font-mono">
                {generatedPrompt}
              </pre>
            </div>

            {/* Debug Info */}
            {debugInfo && (
              <div className="rounded-2xl border border-blue-500/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
                <h3 className="mb-4 text-lg font-bold text-blue-300">Debug Information</h3>
                
                {debugInfo.copywritingProfile && (
                  <div className="mb-4 rounded-xl border border-blue-800/50 bg-zinc-950/70 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-blue-400">Copywriting Profile Identified:</h4>
                    <div className="space-y-1 text-xs text-zinc-300">
                      <p><span className="text-zinc-500">Style:</span> {debugInfo.copywritingProfile.styleCategory || 'N/A'}</p>
                      <p><span className="text-zinc-500">Tone:</span> {debugInfo.copywritingProfile.tone || 'N/A'}</p>
                      <p><span className="text-zinc-500">Word Count:</span> {debugInfo.copywritingProfile.wordCount || 'N/A'}</p>
                      <p><span className="text-zinc-500">Language Style:</span> {debugInfo.copywritingProfile.languageStyle || 'N/A'}</p>
                      {debugInfo.copywritingProfile.keyMessages && (
                        <p><span className="text-zinc-500">Key Messages:</span> {debugInfo.copywritingProfile.keyMessages}</p>
                      )}
                    </div>
                  </div>
                )}

                {debugInfo.scrapedSummary && (
                  <div className="mb-4 rounded-xl border border-green-800/50 bg-zinc-950/70 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-green-400">Scraped Product Summary:</h4>
                    <p className="text-xs text-zinc-300">{debugInfo.scrapedSummary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Cost Info */}
            {costInfo && costInfo.total && (
              <div className="rounded-2xl border border-purple-500/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
                <h3 className="mb-4 text-lg font-bold text-purple-300">Cost Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {costInfo.step1 && (
                    <div className="rounded-xl border border-purple-800/50 bg-zinc-950/70 p-4">
                      <h4 className="mb-2 text-sm font-semibold text-purple-400">Step 1: Static Ad Analysis</h4>
                      <p className="text-xs text-zinc-300">
                        <span className="text-zinc-500">Cost:</span> {costInfo.step1.totalCostFormatted}
                      </p>
                    </div>
                  )}
                  {costInfo.step2 && (
                    <div className="rounded-xl border border-purple-800/50 bg-zinc-950/70 p-4">
                      <h4 className="mb-2 text-sm font-semibold text-purple-400">Step 2: Product Adaptation</h4>
                      <p className="text-xs text-zinc-300">
                        <span className="text-zinc-500">Cost:</span> {costInfo.step2.totalCostFormatted}
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl border-2 border-purple-500/70 bg-purple-500/10 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-purple-300">Total Cost</h4>
                    <p className="text-lg font-bold text-purple-200">
                      {costInfo.total.totalCostFormatted}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

